import type { MarketCase, ToolEvidence } from '../../court/types'
import { getNewsEvidence } from './news'
import { getCaseSearchQuery } from './text'

type SocialWindow = {
  start?: string
  end?: string
  label?: string
}

type SocialMetric = 'post_count' | 'follower_count' | 'mention_count' | 'profile_read' | 'account_activity'

type SocialTarget = {
  platform: string
  handle: string
  url: string
}

export async function getSocialActivityEvidence(marketCase: MarketCase): Promise<ToolEvidence> {
  const queryText = `${marketCase.question} ${marketCase.context ?? ''} ${marketCase.links?.join(' ') ?? ''}`.trim()
  const fetchedAt = new Date().toISOString()
  const metric = detectSocialMetric(queryText)
  const targets = extractSocialTargets(queryText)
  const handle = targets.find((target) => target.platform === 'x')?.handle ?? targets[0]?.handle ?? extractSocialHandle(queryText)
  const window = extractDateWindow(queryText)
  const sources: ToolEvidence['sources'] = []
  const observations: string[] = []

  observations.push(`Resolved social metric candidate: ${metric.replace(/_/g, ' ')}.`)

  if (targets.length) {
    observations.push(`Resolved ${targets.length} social target(s): ${targets.map((target) => `${target.platform}:@${target.handle}`).join(', ')}.`)
  } else if (handle) {
    observations.push(`Resolved social account candidate: @${handle}.`)
  } else {
    observations.push('No exact social handle was found in the case text or links. Social markets need an audited profile URL or @handle from the market context.')
  }

  if (window.start || window.end) {
    observations.push(`Resolved counting window candidate: ${window.label ?? [window.start, window.end].filter(Boolean).join(' to ')}.`)
  } else {
    observations.push(metric === 'follower_count'
      ? 'No counting window was parsed; follower/profile markets can still be audited from current public profile snapshots when the market rule allows it.'
      : 'No exact counting window was parsed. A count market needs an inclusive/exclusive time rule and timezone from the market context.')
  }

  const profileEvidence = targets.length
    ? await getPublicProfileEvidence(targets, metric, queryText).catch((error) => ({
        provider: 'public-social-profiles',
        exact: false,
        observation: `Public social profile reads failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
        sources: [] as ToolEvidence['sources'],
      }))
    : undefined

  if (profileEvidence) {
    observations.push(profileEvidence.observation)
    sources.push(...profileEvidence.sources)
  }

  const canUseXCountingTools = /^(post_count|mention_count|account_activity)$/.test(metric)
  const xHandle = canUseXCountingTools
    ? targets.find((target) => target.platform === 'x')?.handle ?? handle
    : undefined
  const publicCounterEvidence = xHandle
    ? await getPublicCounterEvidence(xHandle, window, queryText).catch((error) => ({
        provider: 'public-social-counters',
        exact: false,
        observation: `Public social counter discovery failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
        sources: [] as ToolEvidence['sources'],
      }))
    : undefined

  if (publicCounterEvidence) {
    observations.push(publicCounterEvidence.observation)
    sources.push(...publicCounterEvidence.sources)
  }

  const xCountEvidence = xHandle && window.start && window.end
    ? await getXRecentCountEvidence(xHandle, window, queryText).catch((error) => ({
        provider: 'x-api',
        exact: false,
        status: 'error' as const,
        observation: `X counts API failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
        sources: [] as ToolEvidence['sources'],
      }))
    : undefined

  if (xCountEvidence) {
    observations.push(xCountEvidence.observation)
    sources.push(...xCountEvidence.sources)
  }

  const hasProfileCount = Boolean(profileEvidence?.exact)
  const searchEvidence = hasProfileCount
    ? undefined
    : await getNewsEvidence({
        ...marketCase,
        question: buildSocialAuditQuery(marketCase, handle, window, metric, targets),
        context: marketCase.context,
      }).catch(() => undefined)

  const auditSources = (searchEvidence?.sources ?? []).slice(0, 6)
  if (auditSources.length) {
    observations.push(`Found ${auditSources.length} public search/source result(s) for social-count audit context. These are discovery/audit sources, not an exact post count unless a source directly provides the count.`)
    sources.push(...auditSources.map((source) => ({
      ...source,
      value: source.value ? `social-audit:${source.value}` : 'social-audit',
    })))
  } else {
    observations.push(hasProfileCount ? 'Skipped broad social search because public profile/API evidence already exposed an auditable count.' : 'No public search/source result was found for social-count audit context.')
  }

  const hasExactCount = Boolean(publicCounterEvidence?.exact || xCountEvidence?.exact)
  const missing = [
    handle || targets.length ? undefined : 'account handle or profile URL',
    metric === 'follower_count' || (window.start && window.end) ? undefined : 'exact count window',
    hasExactCount || hasProfileCount ? undefined : 'authoritative count source',
  ].filter(Boolean)

  return {
    capability: 'social_activity_data',
    provider: profileEvidence?.exact
      ? profileEvidence.provider
      : publicCounterEvidence?.exact
      ? publicCounterEvidence.provider
      : xCountEvidence?.exact
        ? xCountEvidence.provider
        : profileEvidence?.provider ?? publicCounterEvidence?.provider ?? xCountEvidence?.provider ?? 'social-audit',
    query: queryText,
    fetchedAt,
    status: hasExactCount || hasProfileCount ? 'ok' : sources.length ? 'empty' : 'skipped',
    observations: [
      ...observations,
      missing.length ? `Exact social testimony is limited until the court has: ${missing.join(', ')}.` : 'Exact social testimony has an auditable provider count.',
    ],
    sources,
    error: hasExactCount || hasProfileCount ? undefined : `Exact social count unavailable${missing.length ? `: missing ${missing.join(', ')}` : ''}.`,
  }
}

function detectSocialMetric(text: string): SocialMetric {
  if (/\b(follower|followers|subscriber|subscribers|following)\b/i.test(text)) return 'follower_count'
  if (/\b(mention|mentions|say|says|said|phrase|word|term)\b/i.test(text)) return 'mention_count'
  if (/\b(tweet|tweets|post|posts|repost|reposts|quote posts|stories|reels|videos|uploads)\b/i.test(text)) return 'post_count'
  if (/\b(profile|bio|account|username|handle)\b/i.test(text)) return 'profile_read'
  return 'account_activity'
}

function extractSocialTargets(text: string): SocialTarget[] {
  const targets: SocialTarget[] = []
  const seen = new Set<string>()
  const pattern = /(?:https?:\/\/)?(?:www\.)?(x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|threads\.net|facebook\.com|fb\.com|bsky\.app)\/(@?[A-Za-z0-9_.-]{1,80})(?:\b|\/)/gi

  for (const match of text.matchAll(pattern)) {
    const platform = normalizePlatform(match[1])
    const handle = match[2].replace(/^@/, '')
    if (!platform || isUtilityHandle(handle)) continue
    const url = buildProfileUrl(platform, handle)
    const key = `${platform}:${handle.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ platform, handle, url })
  }

  const mentioned = text.match(/@([A-Za-z0-9_]{1,30})\b/)?.[1]
  if (mentioned && !targets.length && !isUtilityHandle(mentioned)) {
    targets.push({ platform: 'x', handle: mentioned, url: buildProfileUrl('x', mentioned) })
  }

  return targets
}

function normalizePlatform(host: string) {
  const value = host.toLowerCase()
  if (value === 'twitter.com' || value === 'x.com') return 'x'
  if (value === 'instagram.com') return 'instagram'
  if (value === 'tiktok.com') return 'tiktok'
  if (value === 'youtube.com' || value === 'youtu.be') return 'youtube'
  if (value === 'threads.net') return 'threads'
  if (value === 'facebook.com' || value === 'fb.com') return 'facebook'
  if (value === 'bsky.app') return 'bluesky'
  return undefined
}

function isUtilityHandle(handle: string) {
  return /^(home|search|share|i|intent|login|privacy|tos|terms|reel|reels|p|explore|watch|shorts|channel|c|user|hashtag|notifications|messages)$/i.test(handle)
}

function buildProfileUrl(platform: string, handle: string) {
  const clean = handle.replace(/^@/, '')
  if (platform === 'x') return `https://x.com/${clean}`
  if (platform === 'instagram') return `https://www.instagram.com/${clean}/`
  if (platform === 'tiktok') return `https://www.tiktok.com/@${clean}`
  if (platform === 'youtube') return clean.startsWith('@') ? `https://www.youtube.com/${clean}` : `https://www.youtube.com/@${clean}`
  if (platform === 'threads') return `https://www.threads.net/@${clean}`
  if (platform === 'facebook') return `https://www.facebook.com/${clean}`
  if (platform === 'bluesky') return `https://bsky.app/profile/${clean}`
  return `https://${platform}.com/${clean}`
}

function extractSocialHandle(text: string) {
  const linked = text.match(/(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})(?:\b|\/)/i)?.[1]
  const mentioned = text.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1]
  const handle = linked ?? mentioned

  if (!handle || /^(home|search|share|i|intent|login|privacy|tos)$/i.test(handle)) return undefined
  return handle
}

function extractDateWindow(text: string): SocialWindow {
  const exactFromTo = text.match(/\bfrom\s+([A-Z][a-z]+)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(ET|UTC)?\s+to\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s*(20\d{2})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(ET|UTC)?/i)
  if (exactFromTo) {
    const startMonth = exactFromTo[1]
    const startDay = exactFromTo[2]
    const startYear = exactFromTo[3] ?? exactFromTo[10]
    const endMonth = exactFromTo[8]
    const endDay = exactFromTo[9]
    const endYear = exactFromTo[10]
    const start = toIsoDateTime(startMonth, startDay, startYear, exactFromTo[4], exactFromTo[5] ?? '00', exactFromTo[6], exactFromTo[7])
    const end = toIsoDateTime(endMonth, endDay, endYear, exactFromTo[11], exactFromTo[12] ?? '00', exactFromTo[13], exactFromTo[14])

    return {
      start,
      end,
      label: `${startMonth} ${startDay}, ${startYear} ${exactFromTo[4]}:${exactFromTo[5] ?? '00'} ${exactFromTo[6].toUpperCase()} ${exactFromTo[7]?.toUpperCase() ?? ''} to ${endMonth} ${endDay}, ${endYear} ${exactFromTo[11]}:${exactFromTo[12] ?? '00'} ${exactFromTo[13].toUpperCase()} ${exactFromTo[14]?.toUpperCase() ?? ''}`.replace(/\s+/g, ' ').trim(),
    }
  }

  const datedRange = text.match(/\b([A-Z][a-z]+)\s+(\d{1,2})\s*[-–]\s*([A-Z][a-z]+)?\s*(\d{1,2}),?\s*(20\d{2})\b/)
  if (datedRange) {
    const startMonth = datedRange[1]
    const startDay = datedRange[2]
    const endMonth = datedRange[3] ?? startMonth
    const endDay = datedRange[4]
    const year = datedRange[5]
    const start = toIsoDate(startMonth, startDay, year)
    const end = toIsoDate(endMonth, endDay, year, true)
    return {
      start,
      end,
      label: `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`,
    }
  }

  const byDate = text.match(/\bby\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s*(20\d{2})\b/)
  if (byDate) {
    return {
      end: toIsoDate(byDate[1], byDate[2], byDate[3], true),
      label: `by ${byDate[1]} ${byDate[2]}, ${byDate[3]}`,
    }
  }

  return {}
}

function toIsoDate(monthName: string, day: string, year: string, endOfDay = false) {
  const month = monthNames[monthName.toLowerCase()]
  if (!month) return undefined
  return `${year}-${month}-${day.padStart(2, '0')}T${endOfDay ? '23:59:59' : '00:00:00'}Z`
}

function toIsoDateTime(monthName: string, day: string, year: string, hour: string, minute: string, meridiem: string, timezone?: string) {
  const month = monthNames[monthName.toLowerCase()]
  if (!month) return undefined

  let parsedHour = Number(hour)
  const parsedMinute = Number(minute)
  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) return undefined

  if (/pm/i.test(meridiem) && parsedHour !== 12) parsedHour += 12
  if (/am/i.test(meridiem) && parsedHour === 12) parsedHour = 0

  const offsetHours = /^ET$/i.test(timezone ?? '') ? 4 : 0
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), parsedHour + offsetHours, parsedMinute, 0))
  if (Number.isNaN(date.getTime())) return undefined

  return date.toISOString()
}

async function getPublicProfileEvidence(targets: SocialTarget[], metric: SocialMetric, queryText: string) {
  const sources: ToolEvidence['sources'] = []
  const observations: string[] = []
  const counts: Array<{ platform: string; handle: string; metric: string; count: number; source: string }> = []

  for (const target of targets.slice(0, 4)) {
    if (target.platform === 'x') {
      const xProfile = await getXPublicWebProfile(target.handle).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : 'X web profile lookup failed',
      }))

      if (xProfile.ok) {
        const parsedCounts = [
          { metric: 'followers', count: xProfile.legacy.followers_count, raw: `${xProfile.legacy.followers_count} followers` },
          { metric: 'following', count: xProfile.legacy.friends_count, raw: `${xProfile.legacy.friends_count} following` },
          { metric: 'posts', count: xProfile.legacy.statuses_count, raw: `${xProfile.legacy.statuses_count} posts` },
        ].filter((item) => typeof item.count === 'number')

        if (metric === 'follower_count' && typeof xProfile.legacy.followers_count === 'number') {
          counts.push({
            platform: target.platform,
            handle: target.handle,
            metric: 'followers',
            count: xProfile.legacy.followers_count,
            source: target.url,
          })
        }

        observations.push(`x:@${target.handle} public web profile API exposed followers=${xProfile.legacy.followers_count}, following=${xProfile.legacy.friends_count}, posts=${xProfile.legacy.statuses_count}.`)
        sources.push({
          title: `X public web profile API: @${target.handle}`,
          url: target.url,
          observedAt: new Date().toISOString(),
          value: JSON.stringify({
            role: 'x-public-web-profile',
            source: 'guest-graphql-user-by-screen-name',
            screenName: xProfile.core.screen_name,
            name: xProfile.core.name,
            description: xProfile.legacy.description,
            verified: xProfile.is_blue_verified,
            parsedCounts,
            queryId: xProfile.queryId,
            caseQuery: getCaseSearchQuery(queryText),
          }),
        })

        continue
      }

      observations.push(`x:@${target.handle} public web profile API failed: ${xProfile.error}.`)
      sources.push({
        title: `X public web profile API failed: @${target.handle}`,
        url: target.url,
        observedAt: new Date().toISOString(),
        value: JSON.stringify({
          role: 'x-public-web-profile',
          error: xProfile.error,
        }),
      })
    }

    if (target.platform === 'instagram') {
      const instagramProfile = await getInstagramPublicWebProfile(target.handle).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : 'Instagram web profile lookup failed',
      }))

      if (instagramProfile.ok) {
        const parsedCounts = [
          { metric: 'followers', count: instagramProfile.followersCount, raw: `${instagramProfile.followersCount} followers` },
          { metric: 'following', count: instagramProfile.followingCount, raw: `${instagramProfile.followingCount} following` },
          { metric: 'posts', count: instagramProfile.postCount, raw: `${instagramProfile.postCount} posts` },
        ].filter((item) => typeof item.count === 'number')

        if (metric === 'follower_count' && typeof instagramProfile.followersCount === 'number') {
          counts.push({
            platform: target.platform,
            handle: target.handle,
            metric: 'followers',
            count: instagramProfile.followersCount,
            source: target.url,
          })
        }

        observations.push(`instagram:@${target.handle} public web profile API exposed followers=${instagramProfile.followersCount}, following=${instagramProfile.followingCount}, posts=${instagramProfile.postCount}.`)
        sources.push({
          title: `Instagram public web profile API: @${target.handle}`,
          url: target.url,
          observedAt: new Date().toISOString(),
          value: JSON.stringify({
            role: 'instagram-public-web-profile',
            source: 'web_profile_info',
            username: instagramProfile.username,
            fullName: instagramProfile.fullName,
            biography: instagramProfile.biography,
            parsedCounts,
            caseQuery: getCaseSearchQuery(queryText),
          }),
        })

        continue
      }

      observations.push(`instagram:@${target.handle} public web profile API failed: ${instagramProfile.error}.`)
      sources.push({
        title: `Instagram public web profile API failed: @${target.handle}`,
        url: target.url,
        observedAt: new Date().toISOString(),
        value: JSON.stringify({
          role: 'instagram-public-web-profile',
          error: instagramProfile.error,
        }),
      })
    }

    if (target.platform === 'tiktok') {
      const tikTokProfile = await getTikTokPublicCounterProfile(target.handle).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : 'TikTok public counter lookup failed',
      }))

      if (tikTokProfile.ok) {
        const parsedCounts = [
          { metric: 'followers', count: tikTokProfile.stats.followers, raw: `${tikTokProfile.stats.followers} followers` },
          { metric: 'following', count: tikTokProfile.stats.following, raw: `${tikTokProfile.stats.following} following` },
          { metric: 'videos', count: tikTokProfile.stats.videos, raw: `${tikTokProfile.stats.videos} videos` },
          { metric: 'likes', count: tikTokProfile.stats.likes, raw: `${tikTokProfile.stats.likes} likes` },
        ].filter((item) => typeof item.count === 'number')

        if (metric === 'follower_count' && typeof tikTokProfile.stats.followers === 'number') {
          counts.push({
            platform: target.platform,
            handle: target.handle,
            metric: 'followers',
            count: tikTokProfile.stats.followers,
            source: tikTokProfile.sourceUrl,
          })
        }

        observations.push(`tiktok:@${target.handle} TokCounter public profile API exposed followers=${tikTokProfile.stats.followers}, following=${tikTokProfile.stats.following}, videos=${tikTokProfile.stats.videos}, likes=${tikTokProfile.stats.likes}.`)
        sources.push({
          title: `TikTok public counter API: @${target.handle}`,
          url: tikTokProfile.sourceUrl,
          observedAt: new Date().toISOString(),
          value: JSON.stringify({
            role: 'tiktok-public-counter-profile',
            source: 'tokcounter-user-data',
            userId: tikTokProfile.userId,
            id: tikTokProfile.id,
            username: tikTokProfile.username,
            verified: tikTokProfile.verified,
            parsedCounts,
            caseQuery: getCaseSearchQuery(queryText),
            limitation: 'Third-party public counter snapshot; use TikTok official/API evidence or screenshots as corroboration when market rules require platform-native proof.',
          }),
        })

        continue
      }

      observations.push(`tiktok:@${target.handle} TokCounter public profile API failed: ${tikTokProfile.error}.`)
      sources.push({
        title: `TikTok public counter API failed: @${target.handle}`,
        url: `https://tiktok-api.tokcounter.com/user/data/${encodeURIComponent(target.handle.replace(/^@/, ''))}`,
        observedAt: new Date().toISOString(),
        value: JSON.stringify({
          role: 'tiktok-public-counter-profile',
          error: tikTokProfile.error,
        }),
      })
    }

    const profile = await fetchPublicProfileSnapshot(target).catch((error) => ({
      ok: false as const,
      status: 0,
      observation: `${target.platform}:@${target.handle} public profile snapshot failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
    }))

    if (!profile.ok) {
      observations.push(profile.observation)
      sources.push({
        title: `${target.platform} public profile: @${target.handle}`,
        url: target.url,
        observedAt: new Date().toISOString(),
        value: JSON.stringify({
          role: 'public-profile-snapshot',
          status: profile.status,
          limitation: profile.observation,
        }),
      })
      continue
    }

    const parsedCounts = parseSocialCounts(`${profile.title ?? ''} ${profile.description ?? ''} ${profile.text ?? ''}`)
    for (const parsed of parsedCounts) {
      if (metric === 'follower_count' && /followers?|subscribers?/i.test(parsed.metric)) {
        counts.push({
          platform: target.platform,
          handle: target.handle,
          metric: parsed.metric,
          count: parsed.count,
          source: target.url,
        })
      }
    }

    observations.push(`${target.platform}:@${target.handle} public profile snapshot returned HTTP ${profile.status}${parsedCounts.length ? ` and exposed count-like text (${parsedCounts.map((item) => `${item.metric}=${item.count}`).join(', ')}).` : ', but no safe follower/post count field was parsed from public metadata.'}`)
    sources.push({
      title: `${target.platform} public profile snapshot: @${target.handle}`,
      url: target.url,
      observedAt: new Date().toISOString(),
      value: JSON.stringify({
        role: 'public-profile-snapshot',
        status: profile.status,
        title: profile.title,
        description: profile.description,
        parsedCounts,
        caseQuery: getCaseSearchQuery(queryText),
      }),
    })
  }

  const best = counts[0]
  return {
    provider: best ? `public-social-profile:${best.platform}` : 'public-social-profiles',
    exact: Boolean(best),
    observation: best
      ? `Public ${best.platform} profile metadata exposed ${best.metric}=${best.count} for @${best.handle}; verify market timing because profile counts are live snapshots unless the source is archived.`
      : observations.join(' '),
    sources,
  }
}

async function getXPublicWebProfile(handle: string) {
  const bearer = '***REMOVED***'
  const queryId = process.env.HELIA_X_USER_BY_SCREEN_NAME_QUERY_ID ?? 'IGgvgiOx4QZndDHuD3x9TQ'
  const guestPayload = await activateXGuestToken(bearer)

  const variables = { screen_name: handle }
  const features = {
    hidden_profile_subscriptions_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: true,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
  }
  const fieldToggles = { withPayments: true, withAuxiliaryUserLabels: true }
  const url = new URL(`https://x.com/i/api/graphql/${queryId}/UserByScreenName`)
  url.searchParams.set('variables', JSON.stringify(variables))
  url.searchParams.set('features', JSON.stringify(features))
  url.searchParams.set('fieldToggles', JSON.stringify(fieldToggles))

  const response = await fetchWithRetry(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${bearer}`,
      'x-guest-token': guestPayload,
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      accept: '*/*',
      referer: `https://x.com/${handle}`,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  }, 2)
  const payload = await response.json() as XUserByScreenNameResponse
  if (!response.ok) throw new Error(`UserByScreenName returned HTTP ${response.status}`)

  const result = payload.data?.user?.result
  if (!result?.legacy) throw new Error('UserByScreenName response did not include user legacy fields')

  return {
    ok: true as const,
    queryId,
    core: result.core ?? {},
    legacy: result.legacy,
    is_blue_verified: result.is_blue_verified,
  }
}

async function activateXGuestToken(bearer: string) {
  let lastError: string | undefined
  for (const endpoint of ['https://api.x.com/1.1/guest/activate.json', 'https://api.twitter.com/1.1/guest/activate.json']) {
    try {
      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
      }, 2)
      const payload = await response.json() as { guest_token?: string }
      if (response.ok && payload.guest_token) return payload.guest_token
      lastError = `${endpoint} returned HTTP ${response.status}`
    } catch (error) {
      lastError = `${endpoint}: ${error instanceof Error ? error.message : 'guest activation failed'}`
    }
  }

  throw new Error(lastError ?? 'X guest activation failed')
}

async function fetchWithRetry(url: string | URL, init: RequestInit, attempts: number) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  throw lastError
}

async function getInstagramPublicWebProfile(handle: string) {
  const cleanHandle = handle.replace(/^@/, '')
  const url = new URL('https://www.instagram.com/api/v1/users/web_profile_info/')
  url.searchParams.set('username', cleanHandle)

  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: `https://www.instagram.com/${cleanHandle}/`,
      'x-ig-app-id': '936619743392459',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  })
  const payload = await response.json() as InstagramWebProfileResponse
  if (!response.ok) throw new Error(`web_profile_info returned HTTP ${response.status}`)

  const user = payload.data?.user
  if (!user) throw new Error('web_profile_info response did not include user data')

  return {
    ok: true as const,
    username: user.username ?? cleanHandle,
    fullName: user.full_name,
    biography: user.biography,
    followersCount: user.edge_followed_by?.count,
    followingCount: user.edge_follow?.count,
    postCount: user.edge_owner_to_timeline_media?.count,
  }
}

async function getTikTokPublicCounterProfile(handle: string) {
  const cleanHandle = handle.replace(/^@/, '')
  const url = `https://tiktok-api.tokcounter.com/user/data/${encodeURIComponent(cleanHandle)}`
  const payload = await fetchJson<TikTokCounterProfileResponse>(url)
  if (!payload.success) throw new Error(payload.message ?? 'TokCounter profile endpoint did not return success=true')
  if (!payload.stats) throw new Error('TokCounter profile endpoint returned no stats object')

  return {
    ok: true as const,
    sourceUrl: url,
    userId: payload.userId,
    id: payload.id ?? cleanHandle,
    username: payload.username,
    verified: payload.verified,
    stats: payload.stats,
  }
}

let xUserByScreenNameQueryIdCache: string | undefined

async function getXUserByScreenNameQueryId() {
  if (xUserByScreenNameQueryIdCache) return xUserByScreenNameQueryIdCache

  const html = await fetch('https://x.com/home', {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  }).then((response) => response.text())
  const mainScript = html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"']+\.js/)?.[0]
  if (!mainScript) throw new Error('X main script was not discovered')

  const script = await fetch(mainScript, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  }).then((response) => response.text())
  const queryId = script.match(/queryId:"([^"]+)",operationName:"UserByScreenName"/)?.[1]
  if (!queryId) throw new Error('UserByScreenName query id was not found in X main script')

  xUserByScreenNameQueryIdCache = queryId
  return queryId
}

async function fetchPublicProfileSnapshot(target: SocialTarget) {
  const response = await fetch(target.url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    redirect: 'follow',
  })
  const html = await response.text()

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      observation: `${target.platform}:@${target.handle} returned HTTP ${response.status}.`,
    }
  }

  if (/\b(log in|sign up|enable javascript|captcha|unusual traffic|access denied|temporarily blocked)\b/i.test(html.slice(0, 60_000))) {
    return {
      ok: false as const,
      status: response.status,
      observation: `${target.platform}:@${target.handle} profile loaded but appears gated by login, JavaScript, captcha, or bot protection.`,
    }
  }

  const title = decodeHtml(readTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i))
  const rawCountText = extractRawSocialCountText(html)
  const description = decodeHtml(
    readMeta(html, 'description')
      ?? readMeta(html, 'og:description')
      ?? readMeta(html, 'twitter:description')
      ?? html.match(/content=["']([^"']*(?:Followers?|Following|Posts?)[^"']*)["']/i)?.[1]
      ?? rawCountText,
  )
  const text = decodeHtml(`${rawCountText ?? ''} ${stripTags(html).replace(/\s+/g, ' ').slice(0, 20_000)}`)

  return {
    ok: true as const,
    status: response.status,
    title,
    description,
    text,
  }
}

function extractRawSocialCountText(html: string) {
  return html.match(/(\d[\d,.]*\s*[KMB]?\s+Followers?[\s\S]{0,120}?\d[\d,.]*\s*[KMB]?\s+Following[\s\S]{0,120}?\d[\d,.]*\s*[KMB]?\s+Posts?)/i)?.[1]
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSocialCounts(text: string) {
  const counts: Array<{ metric: string; count: number; raw: string }> = []
  const pattern = /\b(\d[\d,]*(?:\.\d+)?)\s*([KMB])?\s+(followers?|subscribers?|following|posts?|tweets?|videos?|likes?)\b/gi

  for (const match of text.matchAll(pattern)) {
    const count = normalizeCompactNumber(match[1].replace(/,/g, ''), match[2])
    if (typeof count !== 'number') continue
    counts.push({
      metric: match[3].toLowerCase(),
      count,
      raw: match[0],
    })
  }

  return dedupeCounts(counts)
}

function normalizeCompactNumber(value: string, suffix?: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  const multiplier = suffix?.toUpperCase() === 'B' ? 1_000_000_000 : suffix?.toUpperCase() === 'M' ? 1_000_000 : suffix?.toUpperCase() === 'K' ? 1_000 : 1
  return Math.round(numeric * multiplier)
}

function dedupeCounts(counts: Array<{ metric: string; count: number; raw: string }>) {
  const seen = new Set<string>()
  return counts.filter((item) => {
    const key = `${item.metric}:${item.count}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}

function readTag(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim()
}

function readMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const propertyFirst = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i')
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i')
  return html.match(propertyFirst)?.[1]?.trim() ?? html.match(contentFirst)?.[1]?.trim()
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeHtml(value: string | undefined) {
  if (!value) return undefined
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

async function getXRecentCountEvidence(handle: string, window: SocialWindow, queryText: string) {
  const bearerToken = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) {
    return {
      provider: 'x-api',
      exact: false,
      status: 'skipped' as const,
      observation: 'X recent-count API was skipped because X_BEARER_TOKEN/TWITTER_BEARER_TOKEN is not configured.',
      sources: [] as ToolEvidence['sources'],
    }
  }

  const search = new URL('https://api.twitter.com/2/tweets/counts/recent')
  search.searchParams.set('query', `from:${handle} -is:retweet`)
  search.searchParams.set('granularity', 'day')
  search.searchParams.set('start_time', window.start as string)
  search.searchParams.set('end_time', window.end as string)

  const response = await fetch(search, {
    headers: {
      authorization: `Bearer ${bearerToken}`,
    },
  })
  const payload = await response.json() as {
    meta?: { total_tweet_count?: number }
    data?: Array<{ start: string; end: string; tweet_count: number }>
    title?: string
    detail?: string
  }

  if (!response.ok) {
    return {
      provider: 'x-api',
      exact: false,
      status: 'error' as const,
      observation: `X recent-count API returned HTTP ${response.status}${payload.detail ? `: ${payload.detail}` : ''}.`,
      sources: [] as ToolEvidence['sources'],
    }
  }

  const total = payload.meta?.total_tweet_count ?? payload.data?.reduce((sum, day) => sum + day.tweet_count, 0)
  return {
    provider: 'x-api',
    exact: typeof total === 'number',
    status: 'ok' as const,
    observation: typeof total === 'number'
      ? `X recent-count API counted ${total} original post(s) from @${handle} for ${window.label ?? 'the parsed window'}. Query excluded retweets; quote/reply treatment depends on X search semantics and market rules.`
      : `X recent-count API responded but did not include a total count for @${handle}.`,
    sources: [
      {
        title: `X recent counts: @${handle}`,
        url: `https://x.com/${handle}`,
        observedAt: new Date().toISOString(),
        value: JSON.stringify({
          query: `from:${handle} -is:retweet`,
          window,
          caseQuery: getCaseSearchQuery(queryText),
          total,
          buckets: payload.data,
        }),
      },
    ],
  }
}

async function getPublicCounterEvidence(handle: string, window: SocialWindow, queryText: string) {
  const sources: ToolEvidence['sources'] = [
    {
      title: `X Tracker public dashboard for @${handle}`,
      url: 'https://xtracker.me/',
      observedAt: new Date().toISOString(),
      value: JSON.stringify({
        role: 'public-counter-dashboard',
        note: 'X Tracker describes itself as an independent analytics tool for Elon Musk posting activity and updates every five minutes.',
      }),
    },
  ]
  const observations: string[] = []
  const totals: Array<{ provider: string; total: number; detail: string; buckets?: unknown }> = []

  const trackerEvents = await fetchJson<XTrackerEvents>('https://xtracker.me/api/events').catch(() => undefined)
  if (trackerEvents?.success && Array.isArray(trackerEvents.data)) {
    const matchingEvent = findMatchingXTrackerEvent(trackerEvents.data, window, queryText)
    observations.push(`X Tracker events API exposed ${trackerEvents.data.length} tracked Polymarket tweet-count event(s).`)
    sources.push({
      title: 'X Tracker events API',
      url: 'https://xtracker.me/api/events',
      observedAt: new Date().toISOString(),
      value: JSON.stringify({
        eventCount: trackerEvents.data.length,
        matchingEvent: matchingEvent
          ? {
              id: matchingEvent.id,
              title: matchingEvent.title,
              slug: matchingEvent.slug,
              startDate: matchingEvent.startDate,
              endDate: matchingEvent.endDate,
              description: matchingEvent.description,
            }
          : undefined,
      }),
    })

    if (matchingEvent) {
      observations.push(`X Tracker matched the market rule source: ${matchingEvent.title}; window ${matchingEvent.startDate} to ${matchingEvent.endDate}.`)
    } else {
      observations.push('X Tracker events API did not expose a matching event for this exact window from the public events list.')
    }
  }

  for (const range of getCandidateTrackerRanges(window)) {
    const url = `https://xtracker.me/api/posts/history?range=${encodeURIComponent(range)}`
    const history = await fetchJson<XTrackerHistory>(url).catch(() => undefined)
    sources.push({
      title: `X Tracker post history (${range})`,
      url,
      observedAt: new Date().toISOString(),
      value: JSON.stringify({
        success: history?.success,
        rowCount: Array.isArray(history?.data) ? history.data.length : undefined,
        sample: Array.isArray(history?.data) ? history.data.slice(0, 5) : undefined,
      }),
    })

    if (!history?.success || !Array.isArray(history.data)) {
      observations.push(`X Tracker history endpoint for range=${range} did not return a usable JSON row set.`)
      continue
    }

    if (!history.data.length) {
      observations.push(`X Tracker history endpoint for range=${range} returned zero rows from the public endpoint.`)
      continue
    }

    const total = sumTrackerHistoryRows(history.data)
    if (typeof total === 'number') {
      totals.push({
        provider: `xtracker:${range}`,
        total,
        detail: `X Tracker public history endpoint returned ${history.data.length} row(s) for range=${range}; summed post-like count fields to ${total}.`,
        buckets: history.data,
      })
    } else {
      observations.push(`X Tracker history endpoint for range=${range} returned rows, but no recognized post-count field could be summed safely.`)
    }
  }

  const advancedSearchUrl = buildXAdvancedSearchUrl(handle, window)
  if (advancedSearchUrl) {
    sources.push({
      title: `X advanced search audit URL: @${handle}`,
      url: advancedSearchUrl,
      observedAt: new Date().toISOString(),
      value: JSON.stringify({
        role: 'manual-browser-audit',
        note: 'Use as a secondary visual/scrape route when a public counter or export is unavailable. Login/wall behavior may limit automation.',
      }),
    })
    observations.push('Prepared an X advanced-search audit URL for browser/screenshot verification if public counters do not expose rows.')
  }

  const best = totals[0]
  return {
    provider: best?.provider ?? 'public-social-counters',
    exact: Boolean(best),
    observation: best
      ? best.detail
      : observations.join(' '),
    sources,
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)

  return JSON.parse(text) as T
}

function getCandidateTrackerRanges(window: SocialWindow) {
  if (!window.start || !window.end) return ['1d', '1w', '1m']

  const start = Date.parse(window.start)
  const end = Date.parse(window.end)
  const days = Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86_400_000)) : undefined
  if (!days) return ['1d', '1w', '1m']
  if (days <= 1) return ['1d', '1w']
  if (days <= 8) return ['1w', '1m']
  return ['1m']
}

function sumTrackerHistoryRows(rows: Array<Record<string, unknown>>) {
  let total = 0
  let found = false

  for (const row of rows) {
    const value = firstNumericField(row, ['count', 'postCount', 'posts', 'tweetCount', 'tweets', 'value', 'total'])
    if (typeof value !== 'number') continue
    total += value
    found = true
  }

  return found ? total : undefined
}

function firstNumericField(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }

  return undefined
}

function findMatchingXTrackerEvent(events: XTrackerEvent[], window: SocialWindow, queryText: string) {
  const normalizedCase = normalizeComparable(queryText)
  const start = window.start ? Date.parse(window.start) : undefined
  const end = window.end ? Date.parse(window.end) : undefined
  const hasParsedWindow = Number.isFinite(start) && Number.isFinite(end)

  return events.find((event) => {
    const eventText = normalizeComparable(`${event.title} ${event.description} ${event.slug}`)
    const textMatch = normalizedCase.includes(eventText) || eventText.split(/\s+/).filter((term) => term.length > 3 && normalizedCase.includes(term)).length >= 5
    const startMatch = start && event.startDate ? Math.abs(Date.parse(event.startDate) - start) < 36 * 60 * 60 * 1000 : false
    const endMatch = end && event.endDate ? Math.abs(Date.parse(event.endDate) - end) < 36 * 60 * 60 * 1000 : false
    if (hasParsedWindow) return Boolean(startMatch && endMatch)

    return textMatch || (startMatch && endMatch)
  })
}

function buildXAdvancedSearchUrl(handle: string, window: SocialWindow) {
  if (!window.start || !window.end) return undefined
  const since = window.start.slice(0, 10)
  const untilDate = new Date(Date.parse(window.end))
  if (Number.isNaN(untilDate.getTime())) return undefined
  untilDate.setUTCDate(untilDate.getUTCDate() + 1)
  const until = untilDate.toISOString().slice(0, 10)
  const query = encodeURIComponent(`from:${handle} since:${since} until:${until} -filter:replies`)

  return `https://x.com/search?q=${query}&src=typed_query&f=live`
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildSocialAuditQuery(marketCase: MarketCase, handle: string | undefined, window: SocialWindow, metric: SocialMetric, targets: SocialTarget[]) {
  const base = getCaseSearchQuery(`${marketCase.question} ${marketCase.context ?? ''}`)
  const targetPart = targets.length
    ? targets.map((target) => `site:${new URL(target.url).hostname}/${target.handle}`).join(' OR ')
    : handle
      ? `@${handle} OR site:x.com/${handle}`
      : 'social account'
  const windowPart = window.label ?? ''
  const metricPart = metric === 'follower_count'
    ? 'followers subscriber count profile stats socialblade livecounts'
    : metric === 'mention_count'
      ? 'mentions phrase posts transcript social search archive'
      : 'tweet count post count posts archive tracker'

  return `${base} ${targetPart} ${windowPart} ${metricPart}`
}

const monthNames: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

type XTrackerEvents = {
  success?: boolean
  data?: XTrackerEvent[]
}

type XTrackerEvent = {
  id?: string
  ticker?: string
  slug?: string
  title?: string
  description?: string
  startDate?: string
  endDate?: string
}

type XTrackerHistory = {
  success?: boolean
  data?: Array<Record<string, unknown>>
}

type XUserByScreenNameResponse = {
  data?: {
    user?: {
      result?: {
        core?: {
          name?: string
          screen_name?: string
          created_at?: string
        }
        is_blue_verified?: boolean
        legacy?: {
          description?: string
          followers_count?: number
          friends_count?: number
          statuses_count?: number
          listed_count?: number
          media_count?: number
          favourites_count?: number
        }
      }
    }
  }
}

type InstagramWebProfileResponse = {
  data?: {
    user?: {
      username?: string
      full_name?: string
      biography?: string
      edge_followed_by?: { count?: number }
      edge_follow?: { count?: number }
      edge_owner_to_timeline_media?: { count?: number }
    }
  }
}

type TikTokCounterProfileResponse = {
  success?: boolean
  message?: string
  userId?: string
  verified?: boolean
  id?: string
  username?: string
  stats?: {
    likes?: number
    followers?: number
    following?: number
    videos?: number
  }
}
