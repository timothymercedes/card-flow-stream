import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailAPIError } from '@lovable.dev/email-js'
import { sendTemplateEmail } from './send-email'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@lovable.dev/email-js', async importOriginal => ({
  ...await importOriginal<typeof import('@lovable.dev/email-js')>(),
  sendLovableEmail: send,
}))

afterEach(() => { vi.unstubAllEnvs(); send.mockReset() })

describe('managed order recap sender', () => {
  it('preserves template data and per-buyer daily retry key', async () => {
    vi.stubEnv('LOVABLE_API_KEY', 'test-only')
    send.mockResolvedValue({})
    const result = await sendTemplateEmail('daily-orders-digest', 'collector@example.org', {
      idempotencyKey: 'daily-digest-buyer-2026-11-12',
      templateData: { dateLabel: 'November 12', orders: [{ orderNumber: 'PB-123', title: 'Collected card', amount: '$12.34', status: 'Paid' }] },
    })
    expect(result).toEqual({ sent: true })
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'collector@example.org', purpose: 'transactional', label: 'daily-orders-digest',
      idempotency_key: 'daily-digest-buyer-2026-11-12',
      subject: 'Your Pull Bid Live orders from November 12',
    })
    expect(send.mock.calls[0][0].text).toContain('Collected card')
    expect(send.mock.calls[0][0].text).toContain('$12.34')
  })
  it('does not retry a suppressed recipient', async () => {
    vi.stubEnv('LOVABLE_API_KEY', 'test-only')
    send.mockRejectedValue(new EmailAPIError(403, 'suppressed', null, 'recipient_suppressed'))
    expect(await sendTemplateEmail('daily-orders-digest', 'collector@example.org')).toEqual({ sent: false, reason: 'recipient_suppressed' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('propagates failures rather than reporting sent', async () => {
    vi.stubEnv('LOVABLE_API_KEY', 'test-only')
    send.mockRejectedValue(new EmailAPIError(500, 'provider failed', null))
    await expect(sendTemplateEmail('daily-orders-digest', 'collector@example.org')).rejects.toThrow('provider failed')
  })
})