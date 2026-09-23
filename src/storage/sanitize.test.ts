import { describe, expect, it } from 'vitest'
import { isPrivateOrLocalIp, resolveSafeUpstream } from '../../vite.llm-proxy'
import {
  mergeSessionsFront,
  sanitizeSession,
  sharePayloadTooLarge,
} from '../storage/sanitize'
import type { TraceSession } from '../types'

describe('isPrivateOrLocalIp', () => {
  it('blocks loopback and RFC1918', () => {
    expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('10.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrLocalIp('172.16.5.1')).toBe(true)
    expect(isPrivateOrLocalIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrLocalIp('::1')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateOrLocalIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('::ffff:7f00:1')).toBe(true)
    expect(isPrivateOrLocalIp('::ffff:0a00:1')).toBe(true)
    expect(isPrivateOrLocalIp('::ffff:c0a8:1')).toBe(true)
    expect(isPrivateOrLocalIp('::ffff:a9fe:a9fe')).toBe(true)
    // Expanded forms (e.g. DNS may return these)
    expect(isPrivateOrLocalIp('0:0:0:0:0:ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('0000:0000:0000:0000:0000:ffff:7f00:0001')).toBe(true)
  })

  it('blocks deprecated IPv4-compatible IPv6 private addresses', () => {
    expect(isPrivateOrLocalIp('::127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('::7f00:1')).toBe(true)
    expect(isPrivateOrLocalIp('0:0:0:0:0:0:127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('::10.0.0.1')).toBe(true)
  })

  it('blocks NAT64 well-known prefix', () => {
    expect(isPrivateOrLocalIp('64:ff9b::7f00:1')).toBe(true)
    expect(isPrivateOrLocalIp('64:ff9b::127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('64:ff9b::a9fe:a9fe')).toBe(true)
    // Even with a public embedded IPv4 — not a valid LLM upstream
    expect(isPrivateOrLocalIp('64:ff9b::808:808')).toBe(true)
  })

  it('allows public addresses', () => {
    expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrLocalIp('1.1.1.1')).toBe(false)
    expect(isPrivateOrLocalIp('::ffff:8.8.8.8')).toBe(false)
    expect(isPrivateOrLocalIp('::ffff:0808:0808')).toBe(false)
    expect(isPrivateOrLocalIp('2001:db8::1')).toBe(false)
    // Must not treat mid-address "ffff" hextet as IPv4-mapped
    expect(isPrivateOrLocalIp('2001:ffff::1')).toBe(false)
  })
})

describe('resolveSafeUpstream', () => {
  it('pins public literal IP and rejects private', async () => {
    const ok = await resolveSafeUpstream('https://8.8.8.8/v1')
    expect(ok.connectIp).toBe('8.8.8.8')
    expect(ok.url.hostname).toBe('8.8.8.8')
    await expect(resolveSafeUpstream('http://127.0.0.1')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('https://localhost')).rejects.toThrow()
  })

  it('rejects IPv4-mapped IPv6 loopback', async () => {
    await expect(resolveSafeUpstream('http://[::ffff:127.0.0.1]')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('http://[::ffff:7f00:1]')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('http://[0:0:0:0:0:ffff:127.0.0.1]')).rejects.toThrow(/内网/)
  })

  it('rejects IPv4-compatible IPv6 loopback', async () => {
    await expect(resolveSafeUpstream('http://[::127.0.0.1]')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('http://[::7f00:1]')).rejects.toThrow(/内网/)
  })

  it('rejects URL-normalized weird IPv4 spellings', async () => {
    await expect(resolveSafeUpstream('http://2130706433')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('http://127.1')).rejects.toThrow(/内网/)
  })

  it('rejects NAT64 well-known prefix to loopback', async () => {
    await expect(resolveSafeUpstream('http://[64:ff9b::7f00:1]')).rejects.toThrow(/内网/)
    await expect(resolveSafeUpstream('http://[64:ff9b::127.0.0.1]')).rejects.toThrow(/内网/)
  })

  it('rejects userinfo in URL', async () => {
    await expect(resolveSafeUpstream('https://user:pass@8.8.8.8')).rejects.toThrow(/用户名/)
  })
})

describe('sanitize + merge', () => {
  it('drops invalid spans and normalizes score', () => {
    const s = sanitizeSession({
      id: 's1',
      title: 't',
      startedAt: '2026-01-01T00:00:00.000Z',
      question: 'q',
      spans: [
        {
          id: 'a',
          name: 'ok',
          kind: 'tool',
          status: 'ok',
          startMs: 0,
          endMs: 1,
          ragChunks: [{ id: 'c1', source: 'x', text: 'hi', score: '0.9' }],
        },
        { id: 'bad' },
      ],
    })
    expect(s?.spans).toHaveLength(1)
    expect(s?.spans[0].ragChunks?.[0].score).toBe(0.9)
  })

  it('prepends incoming and caps length', () => {
    const mk = (id: string): TraceSession => ({
      id,
      title: id,
      startedAt: '2026-01-01T00:00:00.000Z',
      question: 'q',
      spans: [],
    })
    const prev = Array.from({ length: 20 }, (_, i) => mk(`old-${i}`))
    const next = mergeSessionsFront(prev, [mk('new')], 20)
    expect(next[0].id).toBe('new')
    expect(next).toHaveLength(20)
    expect(next.some((s) => s.id === 'old-19')).toBe(false)
  })

  it('rejects oversized share payload', () => {
    expect(sharePayloadTooLarge('x'.repeat(100_001))).toBe(true)
  })
})
