import type { RagChunk } from '../types'

export interface KbDoc {
  id: string
  source: string
  text: string
  url?: string
  tags: string[]
}

export const LOCAL_KB: KbDoc[] = [
  {
    id: 'c1',
    source: 'poi://jing_an_park',
    text: '静安公园：开放式城市公园，设有儿童游乐区与草坪，步行约 6 分钟可达静安寺地铁站周边。适合周末带娃。',
    url: 'https://example.local/poi/jing_an_park',
    tags: ['静安寺', '公园', '亲子', '步行', '周末'],
  },
  {
    id: 'c2',
    source: 'poi://shanghai_natural_history',
    text: '上海自然博物馆：常设亲子讲解与互动展项，自静安寺步行约 12 分钟。周末建议提前预约。',
    url: 'https://example.local/poi/snhm',
    tags: ['静安寺', '博物馆', '亲子', '步行'],
  },
  {
    id: 'c3',
    source: 'poi://jiuguang_kids',
    text: '久光百货亲子乐园：室内游乐，适合雨天，步行约 9 分钟。周末需预约。',
    url: 'https://example.local/poi/jiuguang',
    tags: ['静安寺', '室内', '亲子', '雨天'],
  },
  {
    id: 'c4',
    source: 'guide://weekend_with_kids',
    text: '本地攻略：优先选择有卫生间与遮阴的开放空间，并核对开放时间；雨天改选室内场馆。',
    tags: ['亲子', '周末', '攻略'],
  },
  {
    id: 'c5',
    source: 'poi://busy_mall_far',
    text: '某远郊乐园：驾车约 40 分钟，不在 15 分钟步行圈内，通常应降权。',
    tags: ['远郊', '驾车'],
  },
  {
    id: 'w1',
    source: 'kb://umbrella',
    text: '阵雨概率超过 60% 时建议随身带折叠伞；开敞式公园遇雨体验较差。',
    tags: ['天气', '下雨', '雨伞', '阵雨'],
  },
  {
    id: 'w2',
    source: 'kb://commute',
    text: '上海地铁换乘通道潮湿时注意防滑；短时阵雨对步行 15 分钟内出行影响有限。',
    tags: ['上海', '地铁', '阵雨'],
  },
]

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,，。？?！!、；;：:（）()【】\[\]/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)
}

export function retrieveLocal(query: string, topK = 4): RagChunk[] {
  const tokens = tokenize(query)
  const scored = LOCAL_KB.map((doc) => {
    const hay = `${doc.text} ${doc.tags.join(' ')} ${doc.source}`.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (!t) continue
      if (hay.includes(t)) score += t.length >= 2 ? 1.2 : 0.4
      if (doc.tags.some((tag) => tag.includes(t) || t.includes(tag))) score += 0.8
    }
    return { doc, score: Number(score.toFixed(3)) }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  const max = scored[0]?.score || 1
  return scored.map(({ doc, score }) => ({
    id: doc.id,
    source: doc.source,
    score: Number((0.45 + (0.5 * score) / max).toFixed(3)),
    text: doc.text,
    url: doc.url,
  }))
}
