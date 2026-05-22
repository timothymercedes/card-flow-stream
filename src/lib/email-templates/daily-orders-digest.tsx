import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'Pull Bid Live'
const SITE_URL = 'https://pullbidlive.com'

interface OrderLine {
  orderNumber: string
  title: string
  amount: string // formatted "$12.34"
  status: string
  trackingUrl?: string | null
}

interface DailyOrdersDigestProps {
  buyerName?: string
  dateLabel?: string
  orders?: OrderLine[]
  totalLabel?: string
}

const DailyOrdersDigestEmail = ({
  buyerName,
  dateLabel = 'today',
  orders = [],
  totalLabel = '$0.00',
}: DailyOrdersDigestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Your {SITE_NAME} orders from {dateLabel} — {orders.length} item
      {orders.length === 1 ? '' : 's'}, {totalLabel} total
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your orders from {dateLabel}</Heading>
        <Text style={text}>
          {buyerName ? `Hi ${buyerName},` : 'Hi there,'} here's a recap of
          every order you placed on {SITE_NAME} {dateLabel}.
        </Text>

        <Section style={card}>
          {orders.map((o, i) => (
            <Section key={o.orderNumber + i} style={row}>
              <Text style={orderNumberStyle}>{o.orderNumber}</Text>
              <Text style={titleStyle}>{o.title}</Text>
              <Text style={metaStyle}>
                {o.amount} · {o.status}
                {o.trackingUrl ? (
                  <>
                    {' · '}
                    <Link href={o.trackingUrl} style={link}>
                      Track
                    </Link>
                  </>
                ) : null}
              </Text>
              {i < orders.length - 1 ? <Hr style={hr} /> : null}
            </Section>
          ))}
        </Section>

        <Text style={totalText}>
          <strong>Total spent {dateLabel}: {totalLabel}</strong>
        </Text>

        <Text style={text}>
          View all your orders any time:{' '}
          <Link href={`${SITE_URL}/orders`} style={link}>
            {SITE_URL}/orders
          </Link>
        </Text>

        <Text style={footer}>
          Questions about an order? Just reply to this email and our team will
          help. — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DailyOrdersDigestEmail,
  subject: (data: Record<string, any>) =>
    `Your ${SITE_NAME} orders from ${data?.dateLabel ?? 'today'}`,
  displayName: 'Daily orders digest',
  previewData: {
    buyerName: 'Tim',
    dateLabel: 'May 22',
    totalLabel: '$87.43',
    orders: [
      {
        orderNumber: 'PB-000123',
        title: '2023 Topps Chrome Patrick Mahomes Refractor',
        amount: '$45.00',
        status: 'Paid',
        trackingUrl: null,
      },
      {
        orderNumber: 'PB-000124',
        title: '2024 Bowman Chrome Auto',
        amount: '$42.43',
        status: 'Paid · Awaiting shipment',
        trackingUrl: null,
      },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}
const container = { padding: '24px 24px 32px', maxWidth: '560px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0a0a0a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#374151',
  lineHeight: '1.5',
  margin: '0 0 16px',
}
const card = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 20px',
  backgroundColor: '#fafafa',
}
const row = { margin: '0 0 8px' }
const orderNumberStyle = {
  fontSize: '12px',
  color: '#6b7280',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  margin: '0 0 2px',
}
const titleStyle = {
  fontSize: '14px',
  color: '#0a0a0a',
  fontWeight: 600 as const,
  margin: '0 0 4px',
}
const metaStyle = {
  fontSize: '13px',
  color: '#374151',
  margin: '0 0 8px',
}
const hr = { borderColor: '#e5e7eb', margin: '12px 0' }
const totalText = {
  fontSize: '15px',
  color: '#0a0a0a',
  margin: '0 0 20px',
}
const link = { color: '#2563eb', textDecoration: 'underline' }
const footer = {
  fontSize: '12px',
  color: '#9ca3af',
  margin: '24px 0 0',
}
