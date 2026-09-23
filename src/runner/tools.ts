const GEO: Record<string, { lat: number; lng: number; label: string }> = {
  静安寺: { lat: 31.2235, lng: 121.4453, label: '上海静安寺' },
  上海: { lat: 31.2304, lng: 121.4737, label: '上海市中心' },
  徐家汇: { lat: 31.1883, lng: 121.437, label: '徐家汇' },
  陆家嘴: { lat: 31.2397, lng: 121.4998, label: '陆家嘴' },
}

export function toolGeocode(address: string) {
  const key = Object.keys(GEO).find((k) => address.includes(k))
  if (!key) {
    return {
      ok: false as const,
      error: `未收录该地址，可试：${Object.keys(GEO).join(' / ')}`,
    }
  }
  return { ok: true as const, ...GEO[key], query: address }
}

export async function toolForecast(lat: number, lng: number, signal?: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max,weathercode&forecast_days=2&timezone=Asia%2FShanghai`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const data = (await res.json()) as {
    daily?: {
      time?: string[]
      precipitation_probability_max?: number[]
      weathercode?: number[]
    }
  }
  const tomorrowIdx = 1
  const pop = data.daily?.precipitation_probability_max?.[tomorrowIdx] ?? 0
  const date = data.daily?.time?.[tomorrowIdx] ?? 'tomorrow'
  return {
    provider: 'open-meteo',
    date,
    precipitation_probability_max: pop,
    weathercode: data.daily?.weathercode?.[tomorrowIdx],
    suggestion: pop >= 60 ? '建议带伞' : pop >= 30 ? '可备伞' : '大概率不用伞',
  }
}

export function toolRankVenues(
  chunks: { id: string; text: string; score: number }[],
  walkLimit = 15,
) {
  const ranked = chunks
    .map((c) => {
      const m = c.text.match(/步行约\s*(\d+)\s*分钟/)
      const walk = m ? Number(m[1]) : null
      return { id: c.id, walk_min: walk, score: c.score, text: c.text.slice(0, 48) }
    })
    .filter((x) => x.walk_min === null || x.walk_min <= walkLimit)
    .sort((a, b) => (a.walk_min ?? 99) - (b.walk_min ?? 99) || b.score - a.score)
  return { walk_minutes_lte: walkLimit, ranked }
}
