import React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_URL = 'https://pullbidlive.com'

const WelcomeEmail = ({ username }: { username?: string }) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to PullBid Live — your collector journey starts now</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={hero}>
          <Text style={eyebrow}>PULLBID LIVE</Text>
          <Heading style={h1}>Welcome{username ? `, @${username}` : ''} 🎉</Heading>
          <Text style={heroText}>You just joined a global community of collectors who pull, bid, trade and show off the things they love.</Text>
        </Section>
        <Section style={card}>
          <Text style={step}><strong>1. Make your profile yours</strong><br />Add a photo and a short bio so collectors know who you are.</Text>
          <Text style={step}><strong>2. Build your Vault</strong><br />Scan or add cards and collectibles to track their value over time.</Text>
          <Text style={step}><strong>3. Catch a live show</strong><br />Join live auctions, chat with hosts and win great pulls in real time.</Text>
          <Text style={step}><strong>4. Shop &amp; trade</strong><br />Browse the Marketplace, PB Bazaar and PB Trade for your next grail.</Text>
        </Section>
        <Section style={{ textAlign: 'center', margin: '8px 0 24px' }}>
          <Button href={`${SITE_URL}/onboarding`} style={button}>Start exploring</Button>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>Questions? Visit {SITE_URL}/support any time — we are happy to help. Welcome to the family. — The PullBid Live Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to PullBid Live 🎉',
  displayName: 'Welcome',
  previewData: { username: 'collector' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const hero = { background: 'linear-gradient(135deg,#0f1b2d,#0c3b33)', borderRadius: '16px', padding: '28px 24px', margin: '0 0 20px' }
const eyebrow = { color: '#34d3a0', fontSize: '11px', letterSpacing: '2px', fontWeight: 700 as const, margin: '0 0 8px' }
const h1 = { color: '#ffffff', fontSize: '26px', fontWeight: 800 as const, margin: '0 0 10px' }
const heroText = { color: '#d1e7df', fontSize: '15px', lineHeight: '1.5', margin: 0 }
const card = { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '8px 20px', backgroundColor: '#fafafa' }
const step = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '12px 0' }
const button = { backgroundColor: '#10b981', color: '#ffffff', borderRadius: '999px', padding: '12px 28px', fontWeight: 700 as const, fontSize: '15px', textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', lineHeight: '1.5' }
