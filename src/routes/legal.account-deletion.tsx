import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/account-deletion")({
  head: () => ({
    meta: [
      { title: "Delete Your Account — PullBid Live" },
      {
        name: "description",
        content:
          "How to permanently delete your PullBid Live account and what data is removed or retained.",
      },
    ],
  }),
  component: AccountDeletion,
});

function AccountDeletion() {
  return (
    <LegalLayout title="Delete Your Account" updated="May 29, 2026">
      <p>
        You can permanently delete your PullBid Live account and personal data at any time. This page
        explains how, and what happens to your data.
      </p>

      <h2>Delete from inside the app (fastest)</h2>
      <ul>
        <li>Open PullBid Live and sign in.</li>
        <li>
          Go to <strong>Settings → Account → Delete account</strong>.
        </li>
        <li>
          Type <strong>DELETE</strong> to confirm, then tap <strong>Permanently delete</strong>.
        </li>
        <li>Your account is deleted immediately and you are signed out.</li>
      </ul>

      <h2>Request deletion by email</h2>
      <p>
        If you can't access the app, email <strong>privacy@pullbidlive.com</strong> from the address on
        your account with the subject "Delete my account". We verify ownership and process the request
        within 30 days.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your profile, username, email, and login credentials.</li>
        <li>Push notification tokens and device records.</li>
        <li>Your posts, comments, reactions, stories, bookmarks, and cart.</li>
        <li>Your vault entries, scan history, tutorial progress, and preferences.</li>
        <li>Support tickets, feedback, and other personal records tied to your account.</li>
      </ul>

      <h2>What we retain (and why)</h2>
      <p>
        Some records must be kept to meet legal, tax, accounting, fraud-prevention, and dispute-resolution
        obligations, and are retained in de-identified or restricted form where possible:
      </p>
      <ul>
        <li>Completed transaction and payout records (financial/tax compliance).</li>
        <li>Audit and fraud logs required for security and legal purposes.</li>
      </ul>
      <p>Payment card data is handled by Stripe — PullBid Live never stores full card numbers.</p>

      <h2>Contact</h2>
      <p>privacy@pullbidlive.com · https://pullbidlive.com/support</p>
    </LegalLayout>
  );
}
