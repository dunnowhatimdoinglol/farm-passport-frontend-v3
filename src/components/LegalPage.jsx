// LegalPage — Privacy policy and Terms of use.
// Plain-English drafts for the pilot. NOT legal advice: have them checked before launch.
//
// ✏️  Fill in the OPERATOR details below once — they're used throughout both pages.
//     Anything still in [square brackets] shows highlighted in yellow so it's easy to spot.
import { useEffect } from 'react';

const OPERATOR = {
  name:    '[YOUR FULL LEGAL NAME]',          // the person (or company) responsible, e.g. "Jane Smith, trading as Farm Passport"
  address: '[CONTACT ADDRESS — a business or PO box address is fine]',
  email:   'farmpassport.hello@gmail.com',
  dbRegion: 'London, UK (eu-west-2)',   // Supabase → Project Settings → General → Region
};
const UPDATED = '28 October 2026';
const ACCENT = '#2F6B3A';

// Highlight anything still in [brackets]
function T({ children }) {
  const text = String(children);
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((p, i) => /^\[.*\]$/.test(p)
    ? <mark key={i} className="bg-yellow-200 px-1 rounded">{p}</mark>
    : <span key={i}>{p}</span>);
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">{title}</h2>
      <div className="space-y-3 text-[#3d3d39] leading-relaxed">{children}</div>
    </section>
  );
}

const Ul = ({ children }) => <ul className="list-disc pl-6 space-y-1.5">{children}</ul>;

// ─────────────────────────────────────────────
// PRIVACY POLICY
// ─────────────────────────────────────────────
function Privacy() {
  return (
    <>
      <div className="bg-[#E3EDE3] rounded-2xl p-5 mb-10">
        <p className="font-bold mb-2">The short version</p>
        <Ul>
          <li>We collect what we need to run Farm Passport: your account details, and the records of food you grow, move, sell or claim.</li>
          <li>The journey of each batch of food is recorded on a public blockchain so anyone can check it. Those records are permanent, so we keep personal details off them as far as we can.</li>
          <li>Prices, orders, emails and delivery photos stay private between the farm, the café and us.</li>
          <li>We don’t sell your data or show you adverts.</li>
          <li>You can ask to see, correct or delete your data at any time by emailing <a href={`mailto:${OPERATOR.email}`} className="underline">{OPERATOR.email}</a>.</li>
        </Ul>
      </div>

      <Section id="who" title="1. Who we are">
        <p><T>{`Farm Passport is run by ${OPERATOR.name} (“we”, “us”). We are the “controller” of your personal data under UK data protection law (the UK GDPR and the Data Protection Act 2018).`}</T></p>
        <p><T>{`Contact: ${OPERATOR.email} · ${OPERATOR.address}`}</T></p>
        <p>Farm Passport is currently a <strong>pilot</strong>. During the pilot, blockchain records are made on a public <strong>test network</strong> (Base Sepolia).</p>
      </Section>

      <Section id="collect" title="2. What we collect">
        <p className="font-semibold">If you’re a diner</p>
        <Ul>
          <li>Your email address, username and password (stored scrambled — we can never see it).</li>
          <li>Anything you add to your profile: a short bio and a profile photo.</li>
          <li>The receipts you scan, the badges and stamps you collect, and which farms and cafés they came from.</li>
        </Ul>
        <p className="font-semibold pt-2">If you’re a farm</p>
        <Ul>
          <li>Your name, farm name, email address, location and County Parish Holding (CPH) number.</li>
          <li>Your farm’s blockchain account address. Your private key stays on your device or in your own wallet — we never receive it.</li>
          <li>Batches you register, prices you set, orders, dispatches and delivery charges.</li>
        </Ul>
        <p className="font-semibold pt-2">If you’re a café, restaurant, depot or courier</p>
        <Ul>
          <li>Your business name, contact email and business reference (for example your food business registration).</li>
          <li>A blockchain account address we create for your business.</li>
          <li>Orders, deliveries you confirm (including any notes and delivery photos), stock, saved dishes, sales and receipts you create.</li>
        </Ul>
        <p className="font-semibold pt-2">Everyone</p>
        <Ul>
          <li>Technical information our hosting providers record automatically, such as your IP address, browser type and the time of a request, in server logs.</li>
          <li>Small items saved in your browser to keep you signed in (see section 10).</li>
          <li>Emails you send us.</li>
        </Ul>
      </Section>

      <Section id="blockchain" title="3. What goes on the blockchain">
        <p>A blockchain is a public, shared record that can’t be edited or deleted once written. That permanence is what makes Farm Passport trustworthy — and it’s why we’re careful about what goes on it.</p>
        <p><strong>Recorded on the blockchain (public and permanent):</strong></p>
        <Ul>
          <li>Batches: product, quantity, unit, harvest date and use-by date, and any recall (with its reason).</li>
          <li>Business names only: the farm name, and the names of approved cafés, restaurants, depots and couriers.</li>
          <li>Each shipment and step in a batch’s journey: quantities, times, and any notes entered at that step.</li>
          <li>Digital fingerprints of delivery photos and of agreed orders — not the photos or prices themselves. A fingerprint can’t be turned back into the original; it only proves the original hasn’t been changed.</li>
          <li>Badges: which batch a badge was claimed for, linked to a <strong>random code</strong> we create for each diner. It isn’t based on your email or anything else about you, and only our database knows it’s yours — so if you delete your account, nothing links those badges to you any more.</li>
        </Ul>
        <p><strong>Never recorded on the blockchain:</strong> passwords, email addresses, people’s names, addresses or farm locations, prices, orders, delivery photos, profile photos, bios, CPH numbers and business references.</p>
        <p>Please don’t type personal details into notes (for example a driver’s full name or phone number), because notes become part of the permanent record.</p>
      </Section>

      <Section id="why" title="4. Why we use your data, and our lawful basis">
        <Ul>
          <li><strong>To provide Farm Passport</strong> — accounts, batches, orders, deliveries, receipts, badges and the leaderboard. <em>Basis: contract</em> (it’s needed to provide the service you signed up for).</li>
          <li><strong>To check farms and businesses are genuine</strong> before approving them, and to prevent fraud and misuse. <em>Basis: legitimate interests</em> — keeping the records trustworthy for everyone.</li>
          <li><strong>To keep a permanent, checkable traceability record</strong> of food on the blockchain. <em>Basis: legitimate interests</em> — traceability is the core purpose of the service, and we limit personal data on it.</li>
          <li><strong>To send service emails</strong> such as email verification and account approvals. <em>Basis: contract.</em> We don’t send marketing emails; if that ever changes we’ll ask first.</li>
          <li><strong>To keep the service secure and working</strong>, using server logs. <em>Basis: legitimate interests.</em></li>
          <li><strong>To meet legal obligations</strong>, for example responding to lawful requests. <em>Basis: legal obligation.</em></li>
        </Ul>
      </Section>

      <Section id="share" title="5. Who can see your data">
        <Ul>
          <li><strong>The public:</strong> anything on the blockchain (section 3), farm profiles, batch journeys, and the leaderboard (your username and badge counts — never your email).</li>
          <li><strong>The farm and café in a trade:</strong> each can see the order, prices, delivery charges, notes and delivery photos for deliveries between them.</li>
          <li><strong>Our service providers</strong>, who handle data only on our instructions:
            <Ul>
              <li><T>{`Supabase — database and photo storage (${OPERATOR.dbRegion})`}</T></li>
              <li>Render — hosting for our website and server (United States / EU)</li>
              <li>Brevo — sending our emails (EU)</li>
              <li>Alchemy — connecting our server to the blockchain (United States)</li>
              <li>Google Fonts — loading the text font on our pages, which shares your IP address with Google (United States)</li>
            </Ul>
          </li>
          <li><strong>Authorities</strong>, if the law requires it.</li>
        </Ul>
        <p>We never sell your personal data.</p>
      </Section>

      <Section id="transfers" title="6. International transfers">
        <p>Some of our providers process data outside the UK, including in the United States. Where they do, we rely on the protections UK law allows, such as the UK–US “data bridge” or the UK International Data Transfer Addendum to standard contractual clauses. The blockchain itself is run by computers around the world.</p>
      </Section>

      <Section id="keep" title="7. How long we keep it">
        <Ul>
          <li><strong>Account details:</strong> while your account is open. When you close it, we delete or anonymise them within 30 days, unless we need to keep something for a legal reason.</li>
          <li><strong>Business records</strong> (orders, prices, deliveries, receipts): up to 6 years after the trade, as these can be needed for accounting and food traceability.</li>
          <li><strong>Delivery photos:</strong> up to 2 years after the delivery.</li>
          <li><strong>Server logs:</strong> kept by our hosting provider for a short period, usually no more than 30 days.</li>
          <li><strong>Blockchain records:</strong> permanent — see section 8.</li>
        </Ul>
      </Section>

      <Section id="rights" title="8. Your rights">
        <p>You have the right to: <strong>access</strong> your data; <strong>correct</strong> it; have it <strong>deleted</strong>; <strong>restrict</strong> or <strong>object</strong> to how we use it; and receive it in a <strong>portable</strong> format. Email <a href={`mailto:${OPERATOR.email}`} className="underline">{OPERATOR.email}</a> and we’ll reply within one month.</p>
        <p><strong>The blockchain exception:</strong> we can’t edit or delete anything already written to the blockchain — nobody can. That’s why we keep personal details off it. When you ask us to delete your data, we delete everything held in our own systems, including the random code that links a diner to their badges — after that, the blockchain records can’t be tied to you. Records about a business’s trading (such as a farm name on a batch) stay on the public record.</p>
      </Section>

      <Section id="children" title="9. Children">
        <p>Diner accounts are for people aged <strong>13 or over</strong>. Farm, café, restaurant, depot and courier accounts are for people aged <strong>18 or over</strong> who are authorised to act for that business. If you believe a child under 13 has created an account, please contact us and we’ll delete it.</p>
      </Section>

      <Section id="cookies" title="10. Cookies and browser storage">
        <p>We don’t use advertising or tracking cookies. We save a small amount of information in your browser’s local storage to keep you signed in and remember simple choices (such as the last dish a café used). This is strictly necessary for the service to work, so we don’t ask for consent for it. You can clear it at any time by signing out or clearing your browser data.</p>
      </Section>

      <Section id="security" title="11. Keeping your data safe">
        <p>Passwords are stored scrambled, connections are encrypted, delivery photos are kept in private storage and shown only through short-lived links, and only approved businesses can write to the blockchain. No system is perfectly secure, so please use a strong, unique password — and if you hold a farm private key, keep it safe and never share it.</p>
      </Section>

      <Section id="changes" title="12. Changes to this policy">
        <p>We’ll update this page if anything changes and show the date at the top. If a change matters, we’ll also let you know by email or in the app.</p>
      </Section>

      <Section id="complain" title="13. Complaints">
        <p>Please contact us first and we’ll try to put things right. You also have the right to complain to the Information Commissioner’s Office (ICO): <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="underline">ico.org.uk/make-a-complaint</a> or 0303 123 1113.</p>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────
// TERMS OF USE
// ─────────────────────────────────────────────
function Terms() {
  return (
    <>
      <div className="bg-[#E3EDE3] rounded-2xl p-5 mb-10">
        <p className="font-bold mb-2">The short version</p>
        <Ul>
          <li>Farm Passport is a free pilot. Things may change, and occasionally break.</li>
          <li>Be truthful in what you record — the blockchain keeps it forever.</li>
          <li>Trades are between the farm and the café. We keep the record; we’re not part of the deal and we don’t handle payments.</li>
          <li>Farm Passport records where food went. It isn’t a food safety, organic or quality certification.</li>
        </Ul>
      </div>

      <Section id="about" title="1. About these terms">
        <p><T>{`These terms apply when you use Farm Passport, run by ${OPERATOR.name} (“we”, “us”). By creating an account or using the service you agree to them. Please also read our Privacy policy, which explains how we use personal data.`}</T></p>
        <p>Farm Passport is a <strong>pilot service</strong>, provided free of charge. Features may change or be withdrawn. During the pilot, blockchain records are made on a test network, and we may move records to a new network or contract as the service develops.</p>
      </Section>

      <Section id="who-can" title="2. Who can use Farm Passport">
        <Ul>
          <li><strong>Diners</strong> must be 13 or over.</li>
          <li><strong>Farms, cafés, restaurants, depots and couriers</strong> must be run by someone aged 18 or over who is authorised to act for that business.</li>
          <li>Business accounts need our approval. We may ask for evidence, such as a CPH number or food business registration, and we may refuse or withdraw approval if we can’t verify a business or if these terms are broken.</li>
        </Ul>
      </Section>

      <Section id="accounts" title="3. Your account">
        <Ul>
          <li>Keep your sign-in details secure and don’t share your account.</li>
          <li><strong>Farm private keys:</strong> if you sign in with a private key or your own wallet, you alone hold it. We never see it and <strong>can’t recover it</strong> if it’s lost. Keep a safe backup.</li>
          <li>Tell us straight away if you think someone else has used your account.</li>
        </Ul>
      </Section>

      <Section id="records" title="4. Records and the blockchain">
        <Ul>
          <li>Everything you record — batches, dispatches, deliveries, steps, sales and notes — must be <strong>accurate and honest</strong>.</li>
          <li>Blockchain records are <strong>public and permanent</strong>. They can’t be edited or deleted. Mistakes are corrected by adding a new, visible entry.</li>
          <li>Don’t put personal information about other people in notes.</li>
          <li>We pay the blockchain network fees during the pilot.</li>
        </Ul>
      </Section>

      <Section id="business" title="5. For farms and food businesses">
        <Ul>
          <li>You remain fully responsible for meeting the laws that apply to your business, including food safety, hygiene, labelling, allergen, traceability and animal health rules.</li>
          <li>Farm Passport is a record-keeping and transparency tool. It does <strong>not</strong> inspect, certify or guarantee the quality, safety, origin or organic status of any food. Don’t describe it as a certification.</li>
          <li>Information shown to diners about your business must not be misleading.</li>
        </Ul>
      </Section>

      <Section id="trades" title="6. Orders, prices and payments">
        <Ul>
          <li>Orders, prices and delivery charges are agreed <strong>directly between the farm and the café</strong>. We are not a party to that agreement and we don’t process payments.</li>
          <li>Any dispute about quantity, quality, price or payment is between the farm and the café. The records in Farm Passport, including delivery photos, may help you resolve it, but we can’t decide it for you.</li>
        </Ul>
      </Section>

      <Section id="content" title="7. Your content">
        <Ul>
          <li>You keep ownership of anything you upload, such as photos, notes and bios. You give us permission to store and show it as needed to run Farm Passport.</li>
          <li>Only upload content you have the right to use. Delivery photos should show the goods — please avoid capturing people’s faces or personal documents.</li>
          <li>We may remove content that breaks these terms.</li>
        </Ul>
      </Section>

      <Section id="badges" title="8. Badges, stamps and the leaderboard">
        <p>Badges, stamps and leaderboard positions are just for fun. They have no money value, can’t be exchanged or transferred, and we may adjust or remove them if they were gained by misuse (for example claiming receipts that weren’t yours).</p>
      </Section>

      <Section id="use" title="9. Fair use">
        <p>Don’t: record false information; create receipts for food that wasn’t sold; claim receipts that aren’t yours; impersonate a farm or business; try to break, overload or get around the security of the service; or use it for anything unlawful.</p>
      </Section>

      <Section id="availability" title="10. Availability and changes">
        <p>We try to keep Farm Passport running smoothly but can’t promise it will always be available or error-free, especially during the pilot. We may update these terms; if a change matters we’ll tell you in advance by email or in the app.</p>
      </Section>

      <Section id="liability" title="11. Our responsibility to you">
        <Ul>
          <li>Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that can’t be limited by law.</li>
          <li>If you use Farm Passport as a <strong>consumer</strong>, you have legal rights that these terms don’t affect.</li>
          <li>If you use Farm Passport <strong>for a business</strong>: because the pilot is free, we aren’t liable for loss of profit, business, revenue or goodwill, or for any indirect loss, and our total liability is limited to £100.</li>
          <li>We aren’t responsible for the food itself, or for what farms, cafés, depots and couriers do.</li>
        </Ul>
      </Section>

      <Section id="ending" title="12. Ending your use">
        <p>You can stop using Farm Passport and ask us to close your account at any time. We may suspend or close an account that breaks these terms. Records already on the blockchain stay there (see our Privacy policy).</p>
      </Section>

      <Section id="law" title="13. Law">
        <p>These terms are governed by the law of England and Wales. If you’re a consumer living in Scotland or Northern Ireland, you can also bring proceedings in your local courts.</p>
      </Section>

      <Section id="contact" title="14. Contact">
        <p><T>{`${OPERATOR.email} · ${OPERATOR.address}`}</T></p>
      </Section>
    </>
  );
}

function LegalPage({ doc = 'privacy', onBack, onSwitch }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, [doc]);
  const isPrivacy = doc === 'privacy';

  return (
    <div className="min-h-screen bg-[#F6F6F2] text-[#141414]" style={{ fontFamily: 'Manrope, system-ui, -apple-system, sans-serif' }}>
      <div className="sticky top-3 z-40 flex justify-center px-4">
        <nav className="w-full max-w-3xl flex items-center justify-between gap-3 pl-4 pr-2 py-2 bg-white/80 backdrop-blur-xl border border-black/5 rounded-2xl shadow-sm">
          <button onClick={onBack} className="flex items-center gap-2 font-bold whitespace-nowrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 21l7-7" /></svg>
            Farm Passport
          </button>
          <div className="flex gap-1 bg-[#F1F4EF] rounded-xl p-1 text-sm font-semibold">
            <button onClick={() => onSwitch('privacy')} className={`px-3 py-1.5 rounded-lg transition-colors ${isPrivacy ? 'bg-white shadow-sm' : 'text-[#55554F]'}`}>Privacy</button>
            <button onClick={() => onSwitch('terms')} className={`px-3 py-1.5 rounded-lg transition-colors ${!isPrivacy ? 'bg-white shadow-sm' : 'text-[#55554F]'}`}>Terms</button>
          </div>
        </nav>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">{isPrivacy ? 'Privacy policy' : 'Terms of use'}</h1>
        <p className="text-sm text-[#6A6A63] mb-8">Last updated {UPDATED}</p>
        {isPrivacy ? <Privacy /> : <Terms />}
        <div className="border-t border-[#E2E2DB] pt-6 flex flex-wrap gap-4 justify-between text-sm text-[#5B5B55]">
          <button onClick={onBack} className="font-semibold hover:text-[#141414]">← Back to Farm Passport</button>
          <a href={`mailto:${OPERATOR.email}`} className="hover:text-[#141414]">{OPERATOR.email}</a>
        </div>
      </main>
    </div>
  );
}

export default LegalPage;