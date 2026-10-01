/* Ntiyiso - customer app library.
 *
 * Everything the customer pages share: configuration, icons, translations, the
 * detection engine, the API client, state, alerts, formatting helpers, the nine
 * screens and their wiring, and the auth flow.
 *
 * Loaded by every page under /auth/* and /app/* before that page's script.js.
 * Exposed as window.NT.cust (aliased window.Cust). The only DOM work done at
 * load time is applyDocument(), so it is safe on any page.
 */
"use strict";
(function(global){
var NT = global.NT || (global.NT = {});


/* ══ config ══ */
/* ══════════════════ A1 · CONFIG ══════════════════ */
var DEFAULT_API = 'http://localhost:8000/api/v1';
var CONFIG = {
demoUser:'blessing',
timeoutMs:8000,
maxTextChars:4000,
staffCode:'MUK-DESK-2026'
};
var RULES = {
high:0.75, suspicious:0.40, corroborationCap:0.74, allowlistCap:0.30,
unusualAmountMultiplier:3, newUserAmountFloor:2000, coolingOffSeconds:600,
version:'rules-1.0.0'
};
var ALLOWLIST = [
['Mukuru','mukuru.com'], ['Mukuru','mukuru.co.za'],
['Capitec','capitec.co.za'], ['FNB','fnb.co.za'], ['Standard Bank','standardbank.co.za'],
['Absa','absa.co.za'], ['Nedbank','nedbank.co.za'], ['TymeBank','tymebank.co.za'],
['African Bank','africanbank.co.za'], ['SASSA','sassa.gov.za'], ['SARS','sars.gov.za'],
['Home Affairs','dha.gov.za'], ['SAPS','saps.gov.za'], ['WhatsApp','whatsapp.com'],
['Vodacom','vodacom.co.za'], ['MTN','mtn.co.za'], ['Telkom','telkom.co.za']
];
var SHORTENERS = ['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly',
'cutt.ly','rb.gy','shorturl.at','rebrand.ly','t.ly','tiny.cc','bit.do'];
var RISKY_TLDS = ['xyz','top','click','link','work','loan','gq','cf','tk','ml','ga',
'zip','mov','rest','quest','buzz','monster','sbs','cam','online','site'];
var STUFFING = ['secure','login','verify','verification','rewards','bonus','claim','update','account'];

/* ══ icons ══ */
/* ══════════════════ A2 · ICONS ══════════════════ */
var ICON = {
shield:'<path d="M12 3 5 6v6c0 5 3.2 8.4 7 9.6 3.8-1.2 7-4.6 7-9.6V6l-7-3Z"/>',
briefcase:'<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M2.5 12h19"/>',
lock:'<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="M12 15v2.5"/>',
link:'<path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
heartbreak:'<path d="M12 20.5 4.6 13a5 5 0 0 1 7-7l.4.4.4-.4a5 5 0 0 1 7 7l-2 2"/><path d="m13.5 10.5 2.5 2.5-3 1.5 2 2"/>',
gift:'<rect x="3" y="8.5" width="18" height="12.5" rx="2"/><path d="M3 12.5h18"/><path d="M12 8.5V21"/><path d="M12 8.5S10.5 4 8 4a2.5 2.5 0 0 0 0 5"/><path d="M12 8.5S13.5 4 16 4a2.5 2.5 0 0 1 0 5"/>',
folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5.5-5.5 2 2-5.5z"/>',
signal:'<path d="M4 20V10M9.5 20V5M15 20v-7M20.5 20V8"/>',
check:'<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
question:'<path d="M9 9a3 3 0 1 1 4.2 2.8c-.9.5-1.2 1.1-1.2 2.2"/><path d="M12 17.4v.1"/>',
triangle:'<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4.5M12 17.4v.1"/>',
speaker:'<path d="M4 9.5h3.2L12 6v12L7.2 14.5H4z"/><path d="M16 9.5a3.6 3.6 0 0 1 0 5M18.6 7a7 7 0 0 1 0 10"/>',
stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
trash:'<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L17.5 7"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
send:'<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
book:'<path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 19.5a2 2 0 0 1 2-2h13"/>',
user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
building:'<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 11h.01M15 11h.01"/>',
home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/>',
phone:'<path d="M4 12h3l2-5 3 10 2-6 1.5 3H20"/>',
radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18 6"/>',
chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M16 5v14M3 12h18"/>',
alertOut:'<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 19h16"/>',
gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/>',
logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
chevron:'<path d="m9 6 6 6-6 6"/>',
back:'<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
download:'<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
star:'<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>'
};
function svg(name, cls){
return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
+ ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
+ (ICON[name] || '') + '</svg>';
}
var SCAM_ICON = {
'fake-job-offers':'briefcase',
'verify-your-account':'lock',
'fake-links':'link',
'romance-scams':'heartbreak',
'prize-and-refund-scams':'gift'
};

/* ══ i18n ══ */
/* ══════════════════ A3 · i18n ══════════════════ */
var I18N = {
en:{
'app.tagline':'Check before you click or send',
'verdict.high_risk':'HIGH RISK','verdict.suspicious':'SUSPICIOUS','verdict.looks_genuine':'LOOKS GENUINE',
'instruction.high_risk':'Do not click. Do not reply.',
'instruction.suspicious':'Do not act yet. Check directly with the company or person, using a number you already trust.',
'instruction.looks_genuine':'No warning signs found. Stay careful with money requests.',
'instruction.high_risk_payment':'Pause. Do not send yet.',
'tab.check':'Check','tab.send':'Send','tab.library':'Learn','tab.alerts':'Alerts',
'home.title':'Check something',
'home.lead':'Paste a message, a link, or describe a payment you are about to make.',
'home.message':'Check a message or link',
'home.placeholder':'Paste the suspicious message or link here',
'home.check':'Check it','home.paste':'Paste',
'home.send':'Check before you send','home.library':'Learn the scams',
'home.recent':'Recently checked',
'home.trust':'Nothing you type is kept in full. We store a fingerprint, the verdict and the reasons — never the whole message.',
'home.demo':'Demo data. This is a hackathon prototype. No Mukuru system is accessed.',
'checking.title':'Checking…','checking.message':'Looking at the words and the link.',
'checking.transaction':'Looking at the payment details.','checking.patience':'This usually takes about a second.',
'verdict.why':'Why we say this','verdict.what_to_do':'What to do next',
'verdict.message':'The message you checked','verdict.domains':'The website in this message',
'verdict.domain.warning':'We have not opened it. Do not tap it.',
'verdict.guarantee':'Ntiyiso lowers your risk. It cannot promise that something is safe.',
'verdict.listen':'Listen','verdict.stop':'Stop',
'verdict.report':'Report this scam','verdict.reported':'Reported — thank you',
'verdict.warn':'Warn a friend','verdict.delete':'Delete',
'verdict.appeal':'This looks wrong','verdict.appealed':'Thank you. We will review this one.',
'verdict.learn':'Learn about this scam','verdict.checked':'Checked',
'verdict.offline':'Answering from the built-in rules — the API could not be reached. Same rules, same verdicts.',
'verdict.cooling':'Take {min} minutes before you decide. Scammers rely on you being in a hurry.',
'verdict.reportedDesk':'Your report went to the Mukuru fraud desk.',
'send.title':'Check before you send',
'send.lead':'Answer three things and we will tell you if this payment looks like a scam.',
'send.recipient':'Who are you paying?','send.saved':'Saved recipient','send.new':'Someone new',
'send.name':'Their name','send.country':'Where are they?','send.amount':'How much?',
'send.purpose':'Why are you sending it?','send.note':'Anything else they told you? (optional)',
'send.check':'Check this payment','send.amount_required':'Enter an amount greater than zero.',
'send.name_required':'Enter the name of the person you are paying.',
'send.privacy':'Payment checks use simulated Mukuru history for the demo. No real account is touched.',
'history.title':'Your checks','history.stopped':'scams stopped',
'history.empty':'Nothing checked yet. When you check something it will appear here.',
'history.clear':'Clear my history',
'history.confirm':'This deletes every check stored on this device. Continue?',
'history.cancel':'Cancel','history.masked':'We only keep a shortened version.',
'alerts.title':'Alerts','alerts.empty':'No alerts yet.',
'alerts.empty.body':'When the Mukuru fraud desk acts on a call about your account, it lands here.',
'alerts.markRead':'Mark all as read','alerts.new':'New','alerts.from':'From the Mukuru fraud desk',
'alerts.clear':'Clear alerts',
'library.title':'Learn the scams','library.lead':'How the common tricks work, the red flags, and what to do.',
'library.try':'Try this example','library.how':'How it works','library.flags':'Red flags',
'library.do':'What to do','library.example':'Example message','library.back':'All scams',
'settings.title':'Settings','settings.language':'Language','settings.text':'Text size',
'settings.text.normal':'Normal','settings.text.large':'Large','settings.text.huge':'Very large',
'settings.theme':'Appearance','settings.theme.system':'System','settings.theme.light':'Light',
'settings.theme.dark':'Dark','settings.read':'Read results aloud',
'settings.read.hint':'Reads the verdict, the instruction and the reasons.',
'settings.review':'Translation not yet checked by a first-language speaker.',
'settings.data':'Your data','settings.delete':'Delete my data','settings.deleted':'Everything has been deleted.',
'settings.about':'About',
'settings.about.body':'Ntiyiso means "truth" in Xitsonga. Built for the WeThinkCode_ SheHacks Challenge C: Scam Shield, for Mukuru customers.',
'settings.api':'Connection','settings.api.online':'Connected to the API',
'settings.api.offline':'Offline — using the built-in rules','settings.api.url':'API address',
'settings.privacy':'Privacy',
'settings.privacy.body':'Suspicious links are never opened on your device. The clipboard is read only when you tap Paste. We never ask for SMS access.',
'settings.account':'Signed in as','settings.switch':'Switch account',
'error.offline':'You are offline. Check your connection and try again.',
'error.rate':'Too many checks just now. Please wait a moment.',
'error.server':'Something went wrong on our side. Please try again.',
'error.invalid':'We could not read that. Please check it and try again.',
'error.notfound':'We could not find that one.','error.empty':'There is nothing to check yet. Paste a message first.',
'onboarding.consent':'I agree that Ntiyiso may check the messages and payment details I choose to send, and keep the verdict and reasons so I can see my history.',
'purpose.family':'Family or a friend','purpose.bills':'Bills or airtime',
'purpose.school_or_rent':'School fees or rent','purpose.buying_goods':'Buying goods',
'purpose.fee_for_job_or_visa':'A fee for a job or a visa',
'purpose.fee_to_claim_prize_or_loan':'A fee to claim a prize or a loan',
'purpose.someone_met_online':'Someone I met online','purpose.other':'Something else',
'auth.welcome':'Welcome','auth.who':'Who is signing in?','auth.back':'Back',
'auth.signin':'Sign in','auth.signup':'Create account','auth.customer':'I am a Mukuru customer',
'auth.customerSub':'Check a message, a link or a payment before I act.',
'auth.staff':'I work at Mukuru','auth.staffSub':'The fraud desk: live calls, the threat radar and case work.',
'auth.customerTitle':'Customer sign in','auth.staffTitle':'Mukuru staff sign in',
'auth.staffNote':'Staff accounts need the desk access code.',
'auth.errName':'Please enter your full name.','auth.errPhone':'Please enter a valid South African cellphone number.',
'auth.errEmail':'Please enter a valid email address.','auth.errPass':'Use at least 8 characters.',
'auth.errExists':'An account with that email already exists. Try signing in.',
'auth.errNoAccount':'No account with that email on this device. Create one first.',
'auth.errWrongPass':'That password is not correct.','auth.errStaffCode':'That staff access code is not correct.',
'auth.welcomeBack':'Welcome back, {name}.','auth.created':'Account created. Welcome, {name}.',
'auth.social':'Signed in with {provider}.',
'auth.signout':'Signed out.','auth.staffOnly':'That email belongs to a staff account.',
'auth.fullName':'Full name','auth.email':'Email address','auth.continue':'Continue',
'auth.withProvider':'Continue with {provider}',
'auth.socialNote':'Prototype — there is no real provider sign-in here. Enter the account you '
+ 'want to use and it is created on this device, so you are greeted by your own name.',
'toast.reported':'Reported to the Mukuru fraud desk. Thank you.',
'toast.copied':'Warning copied. Paste it into your family group.',
'toast.deleted':'Deleted.','toast.cleared':'Cleared.',
'toast.sentDesk':'Sent to the fraud desk.',
'reason.NO_SIGNAL':'We found no warning signs in this one.',
'steps.msg.high.1':'Do not click the link and do not reply to the message.',
'steps.msg.high.2':'Block the sender, then delete the message.',
'steps.msg.high.3':'Report it here so other people are warned.',
'steps.msg.mid.1':'Phone the company or person on a number you already have, not one from the message.',
'steps.msg.mid.2':'Ask someone you trust before you act on it.',
'steps.pay.high.1':'Do not send this payment yet.',
'steps.pay.high.2':'Phone the person or company on a number you already trust and confirm it is really them.',
'steps.pay.high.3':'If anyone asked you to keep this payment secret, that is a warning sign on its own.',
'steps.pay.mid.1':'Check with the person directly before you send.',
'steps.pay.mid.2':'Send a small test amount first if you are unsure.',
'steps.genuine.1':'Nothing looks wrong here. Carry on, but stay careful with money requests.',
'steps.genuine.2':'If anything changes, or you feel rushed, check again.',
'staff.overview':'Overview','staff.cockpit':'Live cockpit','staff.radar':'Threat radar',
'staff.business':'Business case','staff.case':'Case study','staff.outbox':'Alerts sent','staff.settings':'Settings',
'staff.desk':'Fraud desk · overview',
'staff.greeting':'Good day, {name}.',
'staff.needsAttention':'Needs attention','staff.open':'Open',
'staff.sessions':'Sessions in view','staff.flagged':'Flagged synthetic','staff.stepups':'Step-ups today',
'staff.liveCalls':'Live calls','staff.review':'In review',
'staff.console':'Console','staff.session':'Session',
'staff.tier':'Account tier','staff.wire':'Requested amount',
'staff.agent':'Desk agent','staff.intent':'Stated intent','staff.elapsed':'Elapsed','staff.risk':'Risk',
'staff.control':'Control','staff.evidence':'Evidence','staff.verdict':'Verdict',
'staff.feed':'Feed the detector','staff.hears':'What the model hears','staff.whatToDo':'And what to do',
'staff.playCloned':'Replay a cloned voice','staff.playReal':'Replay a real voice',
'staff.playFakeVideo':'Replay a deepfake video','staff.playRealVideo':'Replay a real video',
'staff.mic':'Microphone','staff.upload':'Upload','staff.reset':'Reset',
'staff.spectrogram':'Spectrogram · power spectral density','staff.waveform':'Waveform · time domain',
'staff.facemesh':'Face mesh · facial action and temporal integrity',
'staff.pipeline':'Ingest pipeline','staff.band1':'SIP trunk mirror','staff.band2':'μ-law decode',
'staff.band3':'Feature extraction','staff.band4':'Anti-spoof model','staff.band5':'Verdict',
'staff.vectors':'Why — explainability vectors','staff.flaggedOf':'{n} of 4 flagged',
'staff.trajectory':'Risk trajectory · 30 s',
'staff.stepUp':'Biometric step-up','staff.divert':'Divert to fraud unit','staff.diverted':'Diverted',
'staff.packet':'Forensic packet','staff.dismiss':'Dismiss alert','staff.dismissed':'Dismissed',
'staff.monitoring':'Monitoring','staff.verified':'Verified by step-up',
'staff.escalates':'ESCALATES IN {n}s',
'staff.autoOff':'AUTO-ESCALATION OFF',
'staff.recBlock':'Recommended action · block','staff.recVerify':'Recommended action · verify',
'staff.recProceed':'Recommended action · proceed','staff.recCase':'Case opened · Fraud Unit',
'staff.blocked':'Suspend the transfer, push a biometric step-up and open a case with the forensic packet attached.',
'staff.verify':'Keep the caller on the line, run a knowledge check and watch the trajectory for 30 seconds.',
'staff.proceed':'Continue with the standard authorisation flow. Continuous monitoring stays armed.',
'staff.caseOpened':'Forensic packet attached and routed to the fraud desk queue.',
'staff.alertDismissed':'Alert cleared for this session. Continuous scoring stays on.',
'staff.selectSession':'Select a session to load it into the cockpit.',
'staff.sessions_title':'Active authorisation sessions',
'staff.origin':'Origin','staff.carrier':'Carrier','staff.exposure':'Exposure','staff.read':'Read',
'staff.meanScore':'Mean score','staff.selectedStation':'Selected origin station',
'staff.regional':'Regional attack distribution','staff.carrierMix':'Carrier risk mix',
'staff.sources':'Sources and references','staff.precedents':'Precedent — synthetic voice and deepfake impersonation',
'staff.roi':'Exposure and return model','staff.roiHint':'Move the sliders',
'staff.deployment':'Deployment posture','staff.pitch':'The 60-second pitch',
'staff.demoNote':'All sessions, agents and amounts are simulated scenario data.',
'staff.alertSent':'Alert sent to the customer.',
'staff.outboxTitle':'Alerts sent to customers','staff.outboxEmpty':'No alerts sent yet.',
'staff.outboxEmpty.body':'Divert a call or block a payment and the customer gets an alert here.',
'staff.reason':'Reason','staff.sent':'Sent','staff.customer':'Customer'
}
};
I18N.zu = {
'app.tagline':'Hlola ngaphambi kokucindezela noma ukuthumela',
'verdict.high_risk':'INGOZI ENKULU','verdict.suspicious':'KUYASOLISA','verdict.looks_genuine':'KUBONAKALA KUYIQINISO',
'instruction.high_risk':'Ungacindi. Ungaphenduli.',
'instruction.suspicious':'Ungenzi lutho okwamanje. Qinisekisa ngqo nenkampani noma umuntu, usebenzisa inombolo oyithembayo.',
'instruction.looks_genuine':'Asitholanga zimpawu eziyingozi. Qaphela uma kucelwa imali.',
'instruction.high_risk_payment':'Misa. Ungathumeli okwamanje.',
'tab.check':'Hlola','tab.send':'Thumela','tab.library':'Funda','tab.alerts':'Izexwayiso',
'home.title':'Hlola okuthile','home.message':'Hlola umyalezo noma isixhumanisi',
'home.placeholder':'Namathisela umyalezo noma isixhumanisi lapha',
'home.check':'Yihlole','home.paste':'Namathisela','home.recent':'Okuhloliwe',
'checking.title':'Kuyahlolwa…',
'verdict.why':'Kungani sisho lokhu','verdict.what_to_do':'Okufanele ukwenze',
'verdict.domains':'Iwebhusayithi ekulo myalezo','verdict.domain.warning':'Asizange siyivule. Ungayicindi.',
'verdict.guarantee':'I-Ntiyiso yehlisa ingozi. Ayikwazi ukuqinisekisa ukuthi kuphephile.',
'verdict.listen':'Lalela','verdict.stop':'Misa','verdict.report':'Bika lo mkhonyovu',
'verdict.warn':'Xwayisa umngane','verdict.delete':'Susa','verdict.learn':'Funda ngalo mkhonyovu',
'send.title':'Hlola ngaphambi kokuthumela','send.amount':'Malini?','send.purpose':'Kungani uyithumela?',
'send.check':'Hlola le nkokhelo','history.title':'Okuhloliwe','history.stopped':'imikhonyovu evinjiwe',
'alerts.title':'Izexwayiso','library.title':'Funda ngemikhonyovu','settings.title':'Izilungiselelo',
'settings.language':'Ulimi','settings.text':'Usayizi wombhalo','settings.read':'Funda imiphumela ngokuzwakalayo',
'settings.delete':'Susa idatha yami',
'reason.NO_SIGNAL':'Asitholanga zimpawu eziyingozi kulokhu.'
};
var REASONS_EN = {
ASKS_FOR_CREDENTIALS:'It asks for your PIN, OTP or password. Your bank and Mukuru will never ask for those.',
UPFRONT_FEE:'It asks you to pay a fee to get the job, the visa or the prize. Real employers and offices do not charge you.',
ACCOUNT_THREAT:'It says your account will be blocked or closed unless you act. That is pressure, not a real notice.',
ROMANCE_MONEY_REQUEST:'It mixes an emotional story with a request for money. That pattern is common in romance scams.',
UNTRACEABLE_PAYMENT:'It wants payment in a way you cannot reverse — gift cards, crypto or a personal wallet.',
BRAND_IMPERSONATION:'It claims to be a bank, Mukuru or a government office, but the sender or the link is not theirs.',
SECRECY:'It asks you to keep this secret. Real companies never ask for that.',
PRIZE_OR_REFUND:'It promises a prize or a refund you were not expecting.',
TOO_GOOD_JOB_OFFER:'The pay and the conditions sound too good to be true, and there is no proper interview.',
URGENCY:'It pushes you to act quickly. Real organisations do not rush you.',
MOVE_TO_PRIVATE_CHAT:'It wants to move the conversation to WhatsApp, Telegram or a personal number.',
LOOKALIKE_DOMAIN:'The website address is close to a real one, but it is not the real address.',
SUBDOMAIN_TRICK:'A real company name has been tucked inside a longer address to make it look official.',
IP_ADDRESS_URL:'The link goes to a number address, not to a company website.',
NEWLY_REGISTERED_DOMAIN:'This website was registered very recently.',
KEYWORD_STUFFING:'The address is padded with words like "secure", "login" or "verify" that real companies do not use.',
SUSPICIOUS_TLD:'Addresses ending like this are cheap and are often used for scams.',
URL_SHORTENER:'The real address is hidden behind a short link.',
NOT_HTTPS:'This website does not use a secure connection.',
SAFE_BROWSING_HIT:'This link has been reported as unsafe.',
RISKY_PURPOSE_FEE:'You said this is a fee for a job, a visa or a prize. Those fees are the scam.',
RISKY_PURPOSE_UNMET:'You have not met this person in real life. That is how romance and investment scams work.',
RECENT_RISKY_CHECK:'You checked a risky message shortly before this payment. Scammers rush you from the message straight to the payment.',
RAPID_NEW_RECIPIENTS:'You have sent to several new people in a short time. That can be a sign of being pushed.',
UNUSUAL_AMOUNT:'This is much more than you usually send.',
NEW_RECIPIENT:'You have not sent money to this person before.',
NOT_ENOUGH_INFORMATION:'There is not enough here for us to judge. Be careful, and check through an official number you already have.'
};
var REASONS_ZU = {
ASKS_FOR_CREDENTIALS:'Icela i-PIN, i-OTP noma iphasiwedi yakho. Ibhange lakho ne-Mukuru abasoze bakucele lokho.',
UPFRONT_FEE:'Icela ukuthi ukhokhe imali ukuze uthole umsebenzi noma umklomelo. Abaqashi bangempela abakukhokhisi.',
URGENCY:'Ikugcizelela ukuthi wenze ngokushesha. Izinhlangano zangempela azenzi lokho.',
SECRECY:'Icela ukuthi ugcine lokhu kuyimfihlo. Izinkampani zangempela azenzi lokho.',
PRIZE_OR_REFUND:'Ithembisa umklomelo noma imali ebuyiselwayo ongayilindelanga.',
NEW_RECIPIENT:'Awukaze uthumele imali kulo muntu.',
UNUSUAL_AMOUNT:'Lokhu kukhulu kakhulu kunalokho ojwayele ukukuthumela.',
NOT_ENOUGH_INFORMATION:'Akukho okwanele lapha ukuze sahlulele. Qaphela, futhi uqinisekise ngenombolo esemthethweni onayo.',
NO_SIGNAL:'Asitholanga zimpawu eziyingozi kulokhu.'
};
var REASONS = { en:REASONS_EN, zu:REASONS_ZU };
var LANGS = [ { code:'en', label:'English', reviewed:true }, { code:'zu', label:'isiZulu', reviewed:false } ];
function t(key, vars){
var lang = state.settings.lang;
var dict = I18N[lang] || I18N.en;
var s = dict[key];
if(s === undefined) s = I18N.en[key];
if(s === undefined) s = key;
if(vars) s = s.replace(/\{(\w+)\}/g, function(_, k){ return vars[k] === undefined ? '' : vars[k]; });
return s;
}
function reasonText(code){
var dict = REASONS[state.settings.lang] || REASONS_EN;
return dict[code] || REASONS_EN[code] || code;
}
function isReviewed(lang){
for(var i = 0; i < LANGS.length; i++) if(LANGS[i].code === lang) return LANGS[i].reviewed;
return false;
}

/* ══ engine ══ */
/* ══════════════════ A4 · ENGINE ══════════════════ */
var MESSAGE_RULES = [
{ code:'ASKS_FOR_CREDENTIALS', weight:.85, critical:true, negatable:true,
re:/\b(?:send|share|give|confirm|enter|provide|reply with|tell me)\s+(?:me\s+)?(?:your\s+|the\s+)?(?:pin|otp|one[- ]time\s+pin|password|passcode|card\s+number|cvv|full\s+card)\b|\b(?:pin|otp|password)\s+(?:yakho|yenu)\b/gi },
{ code:'UPFRONT_FEE', weight:.80, critical:true,
re:/\b(?:registration|processing|admin|application|clearance|release|handling|customs|training|uniform|activation)\s+fee\b|\bpay\s+(?:a\s+)?(?:small\s+)?(?:fee|deposit)\b|\bfee\s+to\s+(?:start|begin|secure|release|claim|get)\b/gi },
{ code:'ACCOUNT_THREAT', weight:.50, critical:false,
re:/\b(?:account|profile|card|sim)\s+(?:will\s+be|has\s+been|is)\s+(?:blocked|suspended|closed|frozen|deactivated)\b|\b(?:verify|confirm|update)\s+(?:your\s+)?(?:account|details|information)\s+(?:now|immediately|within)\b|\blose\s+access\b/gi },
{ code:'ROMANCE_MONEY_REQUEST', weight:.60, critical:false,
re:/\b(?:i\s+love\s+you|my\s+(?:dear|love|darling))\b[\s\S]{0,120}\b(?:money|send|cash|help\s+me\s+pay)\b|\b(?:hospital|emergency|visa|ticket|clearance)\b[\s\S]{0,60}\b(?:send|need)\b[\s\S]{0,20}\bmoney\b/gi },
{ code:'UNTRACEABLE_PAYMENT', weight:.50, critical:false,
re:/\b(?:gift\s+cards?|itunes\s+cards?|google\s+play\s+cards?|bitcoin|crypto|usdt|btc)\b|\bsend\s+(?:it\s+)?to\s+(?:my\s+)?(?:personal\s+)?(?:wallet|number)\b/gi },
{ code:'BRAND_IMPERSONATION', weight:.45, critical:false,
re:/\b(?:mukuru|capitec|fnb|first\s+national|standard\s+bank|absa|nedbank|tymebank|sassa|sars|home\s+affairs|saps|paypal)\b[\s\S]{0,40}\b(?:team|support|security|department|official|helpdesk)\b/gi },
{ code:'SECRECY', weight:.40, critical:false,
re:/\b(?:do\s?n[o']?t|never|must\s+not|ungaze)\s+tell\s+(?:anyone|anybody|your\s+family)\b|\bkeep\s+(?:this|it)\s+(?:a\s+)?(?:secret|between\s+us|quiet)\b|\bdo\s?n[o']?t\s+discuss\b/gi },
{ code:'PRIZE_OR_REFUND', weight:.35, critical:false,
re:/\b(?:you(?:'ve|\s+have)?\s+won|you\s+are\s+a\s+winner|congratulations|congrats)\b|\b(?:claim|collect)\s+(?:your\s+)?(?:prize|reward|winnings|refund)\b|\blucky\s+draw\b/gi },
{ code:'TOO_GOOD_JOB_OFFER', weight:.35, critical:false,
re:/\bno\s+(?:interview|experience|cv|qualifications?)\s+(?:needed|required)\b|\bearn\s+(?:up\s+to\s+)?r\s?\d[\d\s,.]*\s*(?:per|\/)\s*(?:day|week|month)\b|\bwork\s+from\s+home\b[\s\S]{0,60}\b(?:r\s?\d|earn|salary)\b/gi },
{ code:'URGENCY', weight:.25, critical:false,
re:/\b(?:urgent|urgently|act\s+now|immediately|right\s+now|within\s+\d+\s*(?:minutes?|hours?)|last\s+chance|final\s+warning|expires?\s+(?:today|soon)|limited\s+time)\b/gi },
{ code:'MOVE_TO_PRIVATE_CHAT', weight:.20, critical:false,
re:/\b(?:whats\s?app|whatsapp|telegram|dm\s+me|inbox\s+me)\b|\b(?:chat|talk|message)\s+(?:me\s+)?(?:on|via|through)\s+(?:my\s+)?(?:private|personal)\b/gi }
];
var NEGATION = /\b(?:never|do\s?n[o']?t|will\s+not|won't|no\s+one|we\s+never|ungaze)\b[\s\S]{0,24}$/i;
var URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')\]]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:co\.za|org\.za|gov\.za|net\.za|com|net|org|io|xyz|top|click|link|info|biz|site|online|za)(?:\/[^\s<>"')\]]*)?)/gi;
function extractUrls(text){
var out = [], m; URL_RE.lastIndex = 0;
while((m = URL_RE.exec(text)) !== null){
var u = m[1].replace(/[.,;:)]+$/, '');
if(out.indexOf(u) === -1) out.push(u);
}
return out;
}
function displayDomain(raw){
var href = String(raw).trim();
if(!/^https?:\/\//i.test(href)) href = 'http://' + href;
try{
var host = new URL(href).hostname.toLowerCase();
if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
return host.split('.').slice(-2).join('.');
}catch(e){ return raw; }
}
function collectMessageSignals(text){
var signals = [];
MESSAGE_RULES.forEach(function(rule){
rule.re.lastIndex = 0; var m;
while((m = rule.re.exec(text)) !== null){
if(m[0].length === 0){ rule.re.lastIndex++; continue; }
var start = m.index;
if(rule.negatable){
var before = text.slice(Math.max(0, start - 30), start);
if(NEGATION.test(before)) continue;
}
signals.push({ code:rule.code, category:'message', weight:rule.weight,
critical:rule.critical, evidence:m[0], span:[start, start + m[0].length] });
}
});
return signals;
}
function readLink(raw){
var href = String(raw).trim();
if(!/^https?:\/\//i.test(href)) href = 'http://' + href;
var url; try{ url = new URL(href); }catch(e){ return null; }
var host = url.hostname.toLowerCase(), labels = host.split('.');
var registrable = labels.slice(-2).join('.');
var official = null;
ALLOWLIST.forEach(function(a){ if(a[1] === registrable) official = a[0]; });
var impersonated = null;
if(!official){
var squashed = host.replace(/[^a-z0-9]/g, '');
for(var i = 0; i < ALLOWLIST.length; i++){
var bare = ALLOWLIST[i][1].split('.')[0];
if(bare.length < 4) continue;
var inSub = labels.slice(0, -2).some(function(l){ return l.replace(/[^a-z0-9]/g,'') === bare; });
if(inSub || squashed.indexOf(bare) !== -1){ impersonated = ALLOWLIST[i][0]; break; }
}
}
return { raw:raw, host:host, registrable:registrable, officialBrand:official,
impersonatedBrand:impersonated, isIp:/^\d{1,3}(\.\d{1,3}){3}$/.test(host),
isShortener:SHORTENERS.indexOf(registrable) !== -1,
suspiciousTld:RISKY_TLDS.indexOf(labels[labels.length-1]) !== -1 && !official,
subdomainTrick:!!impersonated && labels.length > 2,
keywordStuffing:STUFFING.some(function(w){ return host.indexOf(w) !== -1; }),
https:url.protocol === 'https:', punycode:labels.some(function(l){ return l.indexOf('xn--') === 0; }) };
}
function collectLinkSignals(urls){
var signals = [];
urls.forEach(function(raw){
var f = readLink(raw); if(!f) return;
function add(code, weight, critical){
signals.push({ code:code, category:'link', weight:weight, critical:!!critical,
evidence:f.host, span:null });
}
if(f.impersonatedBrand && f.subdomainTrick) add('SUBDOMAIN_TRICK', .70, true);
else if(f.impersonatedBrand) add('LOOKALIKE_DOMAIN', .70, true);
if(f.punycode) add('LOOKALIKE_DOMAIN', .70, true);
if(f.isIp) add('IP_ADDRESS_URL', .50);
if(f.keywordStuffing) add('KEYWORD_STUFFING', .30);
if(f.suspiciousTld) add('SUSPICIOUS_TLD', .25);
if(f.isShortener) add('URL_SHORTENER', .20);
if(!f.https) add('NOT_HTTPS', .15);
});
return signals;
}
function collectTransactionSignals(input, ctx){
var signals = [];
function add(code, weight, critical){
signals.push({ code:code, category:'transaction', weight:weight, critical:!!critical, evidence:null, span:null });
}
if(input.purpose === 'fee_for_job_or_visa') add('RISKY_PURPOSE_FEE', .80, true);
if(input.purpose === 'fee_to_claim_prize_or_loan') add('RISKY_PURPOSE_FEE', .80, true);
if(input.purpose === 'someone_met_online') add('RISKY_PURPOSE_UNMET', .50);
var amounts = ctx.history.map(function(h){ return h.amount; })
.filter(function(a){ return a > 0; }).sort(function(a,b){ return a-b; });
if(amounts.length >= 3){
var median = amounts[Math.floor(amounts.length/2)];
if(median > 0 && input.amount > median * RULES.unusualAmountMultiplier) add('UNUSUAL_AMOUNT', .30);
}else if(input.amount > RULES.newUserAmountFloor){ add('UNUSUAL_AMOUNT', .30); }
var known = input.recipient_id && ctx.recipients.some(function(r){ return r.id === input.recipient_id; });
if(!known && input.new_recipient) add('NEW_RECIPIENT', .15);
var hourAgo = Date.now() - 3600000;
var rapid = ctx.history.filter(function(h){
return new Date(h.created_at).getTime() > hourAgo &&
!ctx.recipients.some(function(r){ return r.id === h.recipient_id; });
}).length;
if(rapid >= 3) add('RAPID_NEW_RECIPIENTS', .35);
if(ctx.lastRiskyCheckAt){
var mins = (Date.now() - new Date(ctx.lastRiskyCheckAt).getTime()) / 60000;
if(mins >= 0 && mins <= 30) add('RECENT_RISKY_CHECK', .50);
}
return signals;
}
function fuse(signals){
var seen = {}, unique = [];
signals.forEach(function(s){ if(!seen[s.code]){ seen[s.code] = 1; unique.push(s); } });
var score = 1;
unique.forEach(function(s){ score *= (1 - s.weight); });
score = 1 - score;
var mitigators = [];
var links = unique.filter(function(s){ return s.category === 'link'; });
var critical = unique.some(function(s){ return s.critical; });
var clean = !links.some(function(s){ return s.weight >= .2 && s.code !== 'NOT_HTTPS'; });
if(links.length && clean && !critical){
score = Math.min(score, RULES.allowlistCap);
mitigators.push('ALLOWLISTED_LINKS');
}
var cats = {}; unique.forEach(function(s){ cats[s.category] = 1; });
var corroborationMet = critical || Object.keys(cats).length >= 2;
if(score >= RULES.high && !corroborationMet){
score = RULES.corroborationCap;
mitigators.push('CORROBORATION_NOT_MET');
}
var verdict = score >= RULES.high ? 'high_risk' : score >= RULES.suspicious ? 'suspicious' : 'looks_genuine';
return { score:Math.round(score*1000)/1000, verdict:verdict, corroborationMet:corroborationMet,
mitigators:mitigators, unique:unique };
}
function pickReasons(signals, limit){
var seen = {}, out = [];
signals.slice().sort(function(a,b){
return (Number(b.critical) - Number(a.critical)) || (b.weight - a.weight);
}).forEach(function(s){
if(!seen[s.code] && out.length < (limit || 3)){ seen[s.code] = 1; out.push(s); }
});
return out;
}
function buildHighlights(signals){
return signals.filter(function(s){ return s.span; })
.map(function(s){ return { start:s.span[0], end:s.span[1], code:s.code }; })
.sort(function(a,b){ return a.start - b.start; });
}
function maskExcerpt(text){
var out = text.replace(/\s+/g, ' ').trim();
extractUrls(text).forEach(function(u){ out = out.replace(u, displayDomain(u)); });
out = out.replace(/\b\d{4,}\b/g, function(d){
return d.slice(0,2) + new Array(Math.max(2, d.length-2)+1).join('•');
});
out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]');
return out.length > 120 ? out.slice(0,117) + '…' : out;
}
function learnMoreFor(signals){
var c = {}; signals.forEach(function(s){ c[s.code] = 1; });
if(c.UPFRONT_FEE || c.TOO_GOOD_JOB_OFFER) return 'fake-job-offers';
if(c.ASKS_FOR_CREDENTIALS || c.ACCOUNT_THREAT) return 'verify-your-account';
if(c.ROMANCE_MONEY_REQUEST || c.RISKY_PURPOSE_UNMET) return 'romance-scams';
if(c.PRIZE_OR_REFUND) return 'prize-and-refund-scams';
if(c.LOOKALIKE_DOMAIN || c.SUBDOMAIN_TRICK) return 'fake-links';
return null;
}
var seq = 0;
function newId(prefix){ seq++; return prefix + '_' + Date.now().toString(36) + seq.toString(36); }
function nextSteps(verdict, type){
if(verdict === 'looks_genuine') return [t('steps.genuine.1'), t('steps.genuine.2')];
if(type === 'transaction'){
return verdict === 'high_risk'
? [t('steps.pay.high.1'), t('steps.pay.high.2'), t('steps.pay.high.3')]
: [t('steps.pay.mid.1'), t('steps.pay.mid.2')];
}
return verdict === 'high_risk'
? [t('steps.msg.high.1'), t('steps.msg.high.2'), t('steps.msg.high.3')]
: [t('steps.msg.mid.1'), t('steps.msg.mid.2')];
}
function instructionFor(verdict, type){
if(type === 'transaction' && verdict === 'high_risk') return t('instruction.high_risk_payment');
return t('instruction.' + verdict);
}
function assemble(type, signals, extras){
var fusion = fuse(signals);
var picked = pickReasons(fusion.unique, 3);
var result = {
id:newId('chk'), type:type, status:'complete',
verdict:fusion.verdict, score:fusion.score,
confidence:fusion.corroborationMet ? 0.9 : 0.6,
reasons:picked.map(function(s){ return s.code; }),
reason_text:picked.length ? picked.map(function(s){ return reasonText(s.code); }) : [t('reason.NO_SIGNAL')],
instruction:instructionFor(fusion.verdict, type),
next_steps:nextSteps(fusion.verdict, type),
highlights:type === 'message' ? buildHighlights(signals) : [],
display_domains:[], learn_more:learnMoreFor(signals),
language:state.settings.lang, created_at:new Date().toISOString(),
debug:{ signals:signals, corroboration_met:fusion.corroborationMet,
mitigators_applied:fusion.mitigators, offline:true }
};
if(type === 'transaction' && fusion.verdict === 'high_risk') result.cooling_off_seconds = RULES.coolingOffSeconds;
for(var k in extras){ if(extras.hasOwnProperty(k)) result[k] = extras[k]; }
return result;
}
function offlineCheckMessage(text){
var trimmed = text.trim().slice(0, CONFIG.maxTextChars);
var urls = extractUrls(trimmed);
var signals = collectMessageSignals(trimmed).concat(collectLinkSignals(urls));
return assemble('message', signals, { display_domains:urls.map(displayDomain) });
}
function offlineCheckLink(url){
var signals = collectLinkSignals([url]);
return assemble('link', signals, { display_domains:[displayDomain(url)] });
}
function offlineCheckTransaction(input, ctx){
var signals = collectTransactionSignals(input, ctx);
if(input.note) signals = signals.concat(collectMessageSignals(input.note));
return assemble('transaction', signals, {});
}

/* ══ api ══ */
/* ══════════════════ A5 · API ══════════════════ */
var connection = 'unknown';
function apiBase(){ return (state.settings.api || DEFAULT_API).replace(/\/$/, ''); }
function statusCode(status){
if(status === 400 || status === 422) return 'INVALID_INPUT';
if(status === 404) return 'NOT_FOUND';
if(status === 429) return 'RATE_LIMITED';
return 'INTERNAL_ERROR';
}
function apiRequest(path, options){
var opts = options || {};
var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
var timer = setTimeout(function(){ if(controller) controller.abort(); }, CONFIG.timeoutMs);
return fetch(apiBase() + path, {
method:opts.method || 'GET', body:opts.body, signal:controller ? controller.signal : undefined,
headers:{ 'content-type':'application/json', 'X-Demo-User':CONFIG.demoUser }
}).then(function(res){
clearTimeout(timer);
if(!res.ok){
return res.json().catch(function(){ return null; }).then(function(body){
throw { api:true, code:(body && body.error && body.error.code) || statusCode(res.status), status:res.status };
});
}
connection = 'api'; return res.json();
}).catch(function(err){
clearTimeout(timer);
if(err && err.api) throw err;
connection = 'offline';
throw { api:true, code:'NETWORK_UNAVAILABLE', status:0 };
});
}
function errorMessage(err){
var map = { INVALID_INPUT:'error.invalid', NOT_FOUND:'error.notfound', RATE_LIMITED:'error.rate',
INTERNAL_ERROR:'error.server', NETWORK_UNAVAILABLE:'error.offline' };
return t(map[(err && err.code) || 'INTERNAL_ERROR'] || 'error.server');
}
function checkMessage(text){
return apiRequest('/check/message', { method:'POST', body:JSON.stringify({ text:text, language:state.settings.lang }) })
.catch(function(e){ if(e && e.code !== 'NETWORK_UNAVAILABLE') throw e; return offlineCheckMessage(text); });
}
function checkLink(url){
return apiRequest('/check/link', { method:'POST', body:JSON.stringify({ url:url, language:state.settings.lang }) })
.catch(function(e){ if(e && e.code !== 'NETWORK_UNAVAILABLE') throw e; return offlineCheckLink(url); });
}
function checkTransaction(input, ctx){
return apiRequest('/check/transaction', { method:'POST', body:JSON.stringify(input) })
.catch(function(e){ if(e && e.code !== 'NETWORK_UNAVAILABLE') throw e; return offlineCheckTransaction(input, ctx); });
}
function apiReport(id){
return apiRequest('/report', { method:'POST',
body:JSON.stringify({ check_id:id, note:'Reported from the app' }) }).catch(function(){});
}
function apiFeedback(id, kind){
return apiRequest('/feedback', { method:'POST',
body:JSON.stringify({ check_id:id, kind:kind }) }).catch(function(){});
}

/* ══ state ══ */
/* ══════════════════ A6 · STATE, SESSION, AUTH ══════════════════ */
var CUST_KEY = 'ntiyiso.customer.v1';
var ACCOUNTS_KEY = 'ntiyiso.accounts.v1';
var SESSION_KEY = 'ntiyiso.session.v1';
function daysAgo(n){ return new Date(Date.now() - n*86400000).toISOString(); }
var DEFAULT_SETTINGS = { lang:'en', text:'large', theme:'system', readAloud:false, api:DEFAULT_API };
var state = {
settings:JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
history:[], current:null, currentText:'',
recipients:[
{ id:'rcp_01', name:'Tendai Moyo', country:'ZW' },
{ id:'rcp_02', name:'Mama Chido', country:'ZW' },
{ id:'rcp_03', name:'Joseph Banda', country:'MW' }
],
sends:[
{ recipient_id:'rcp_02', amount:800,  created_at:daysAgo(21) },
{ recipient_id:'rcp_01', amount:1200, created_at:daysAgo(14) },
{ recipient_id:'rcp_02', amount:950,  created_at:daysAgo(9) },
{ recipient_id:'rcp_03', amount:1100, created_at:daysAgo(5) },
{ recipient_id:'rcp_01', amount:750,  created_at:daysAgo(3) }
],
lastRiskyCheckAt:null,
session:null,
role:null,
alerts:[]
};
var STORAGE_OK = (function(){
try{ localStorage.setItem('__ntiyiso_probe','1'); localStorage.removeItem('__ntiyiso_probe'); return true; }
catch(e){ return false; }
})();
var memoryStore = {};
function read(key, fallback){
if(!STORAGE_OK) return memoryStore.hasOwnProperty(key) ? memoryStore[key] : fallback;
try{ var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
catch(e){ return fallback; }
}
function write(key, value){
if(!STORAGE_OK){ memoryStore[key] = value; return; }
try{ localStorage.setItem(key, JSON.stringify(value)); }
catch(e){ memoryStore[key] = value; }
}
function storageNotice(){
if(STORAGE_OK) return '';
return '<div class="notice warn" style="margin-top:16px" role="alert">'
+ '<b>This browser is blocking local storage.</b> Accounts, checks and alerts will be lost '
+ 'the moment you refresh. Start the app with <b>start.bat</b> instead of opening the file '
+ 'directly, and everything is kept.</div>';
}
function loadState(){
var saved = read(CUST_KEY, null);
if(saved){
if(saved.settings) for(var k in saved.settings) if(saved.settings.hasOwnProperty(k)) state.settings[k] = saved.settings[k];
if(saved.history) state.history = saved.history;
if(saved.recipients) state.recipients = saved.recipients;
if(saved.sends) state.sends = saved.sends;
if(saved.lastRiskyCheckAt) state.lastRiskyCheckAt = saved.lastRiskyCheckAt;
}
state.session = read(SESSION_KEY, null);
state.role = state.session ? state.session.role : null;
}
function saveState(){
write(CUST_KEY, {
settings:state.settings,
history:state.history.map(function(h){
return { id:h.id, type:h.type, verdict:h.verdict, score:h.score,
created_at:h.created_at, excerpt:h.excerpt, reported:h.reported, appealed:h.appealed };
}),
recipients:state.recipients, sends:state.sends, lastRiskyCheckAt:state.lastRiskyCheckAt
});
}
function accounts(){ return read(ACCOUNTS_KEY, []); }
function saveAccounts(list){ write(ACCOUNTS_KEY, list); }
function findAccount(email){
var list = accounts();
for(var i = 0; i < list.length; i++) if(list[i].email === email) return list[i];
return null;
}
function normalisePhone(raw){
var d = String(raw).replace(/[^\d]/g, '');
var local;
if(d.indexOf('27') === 0 && d.length === 11) local = '0' + d.slice(2);
else if(d.length === 9) local = '0' + d;
else if(d.length === 10 && d.charAt(0) === '0') local = d;
else return null;
return /^0[678]\d{8}$/.test(local) ? local : null;
}
function startSession(account){
state.session = { role:account.role, name:account.name, email:account.email,
phone:account.phone || '', provider:account.provider || 'password', since:new Date().toISOString() };
state.role = account.role;
write(SESSION_KEY, state.session);
}
function endSession(){
state.session = null; state.role = null;
try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
state.current = null; state.currentText = '';
}

/* ══ alerts ══ */
/* ══════════════════ A7 · ALERTS ══════════════════ */
var ALERTS_KEY = 'ntiyiso.alerts.v1';
function loadAlerts(){ state.alerts = read(ALERTS_KEY, []); }
function saveAlerts(){ write(ALERTS_KEY, state.alerts.slice(0, 60)); }
function pushAlert(to, title, body, kind, who){
state.alerts.unshift({ id:newId('al'), at:new Date().toISOString(), to:to || 'customer',
title:title, body:body, kind:kind || 'info', read:false, who:who || '' });
saveAlerts();
renderAlertDot();
}
function alertsFor(role){
return state.alerts.filter(function(a){ return a.to === role; });
}
function unreadCount(role){
return alertsFor(role).filter(function(a){ return !a.read; }).length;
}
function markAlertsRead(role){
state.alerts.forEach(function(a){ if(a.to === role) a.read = true; });
saveAlerts(); renderAlertDot();
}
function renderAlertDot(){
var dot = document.getElementById('alertDot');
if(!dot) return;
dot.classList.toggle('hidden', unreadCount('customer') === 0);
}

/* ══ helpers ══ */
/* ══════════════════ A8 · HELPERS ══════════════════ */
function $(id){ return document.getElementById(id); }
function esc(s){
return String(s).replace(/[&<>"']/g, function(c){
return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
});
}
var toastHost = null;
function toast(msg, kind){
if(!toastHost){
toastHost = document.querySelector('.toasts');
if(!toastHost){
toastHost = document.createElement('div');
toastHost.className = 'toasts';
toastHost.setAttribute('aria-live','polite');
document.body.appendChild(toastHost);
}
}
var el = document.createElement('div');
el.className = 'toast ' + (kind || '');
el.setAttribute('role','status');
el.textContent = msg;
toastHost.appendChild(el);
setTimeout(function(){ el.remove(); }, 4200);
}
function fillI18n(root){
(root || document).querySelectorAll('[data-i18n]').forEach(function(el){
el.textContent = t(el.getAttribute('data-i18n'));
});
}
function toneOf(v){ return v === 'high_risk' ? 'high' : v === 'suspicious' ? 'mid' : 'low'; }
function verdictWord(v){ return t('verdict.' + v); }
function verdictIconName(v){ return v === 'high_risk' ? 'triangle' : v === 'suspicious' ? 'question' : 'check'; }
function timeAgo(iso){
var diff = (Date.now() - new Date(iso).getTime()) / 1000;
if(diff < 60) return 'just now';
if(diff < 3600) return Math.round(diff/60) + ' min ago';
if(diff < 86400) return Math.round(diff/3600) + ' h ago';
return new Date(iso).toLocaleDateString('en-ZA');
}
function money(n){
return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function initials(name){
return String(name || '?').split(' ').filter(Boolean).map(function(w){ return w.charAt(0); })
.slice(0,2).join('').toUpperCase();
}
function speechAvailable(){ return typeof window !== 'undefined' && 'speechSynthesis' in window; }
function isSpeaking(){ return speechAvailable() && window.speechSynthesis.speaking; }
function stopSpeaking(){ if(speechAvailable()) window.speechSynthesis.cancel(); }
function speak(text){
if(!speechAvailable() || !text) return false;
stopSpeaking();
var u = new SpeechSynthesisUtterance(text);
u.lang = state.settings.lang === 'zu' ? 'zu-ZA' : 'en-ZA';
u.rate = 0.92;
window.speechSynthesis.speak(u);
return true;
}
/* MERGE NOTE · the theme/text attributes used to sit on <html>. They now
   sit on #customerRoot, because <html> and <body> are shared with the
   fraud-desk console and its own palette lives there. */
function custRoot(){ return document.documentElement; }
function applyDocument(){
var html = document.documentElement;
html.setAttribute('data-text', state.settings.text);
html.setAttribute('data-theme', state.settings.theme);
html.lang = state.settings.lang === 'zu' ? 'zu-ZA' : 'en-ZA';
}

/* ══ scam library ══ */
/* ══════════════════ B1 · SCAM LIBRARY ══════════════════ */
var SCAMS = [
{ slug:'fake-job-offers', title:'Fake job offers',
summary:'A job that asks you to pay first, or hires you without an interview.',
how:'You are offered work that pays well and needs no experience. There is no real interview. Then comes the catch: a registration fee, training fee, uniform fee or "clearance" before you can start. You pay, and the job disappears.',
flags:['You are asked to pay anything to get the job','No interview, no contract, no company address',
'The pay is far higher than the work deserves','They move you quickly to WhatsApp or a personal number',
'They want the fee paid today, before you can think'],
todo:['Do not pay any fee. A real employer pays you, not the other way round.',
'Search the company name with the word "scam" before you reply.',
'Ask for the company registration number and a landline, then phone it yourself.',
'Report the message so others are warned.'],
example:'Congratulations! You have been selected for a job at our company. Salary R25,000 per month, no interview needed, work from home. To secure your position you must pay a registration fee of R350 today. WhatsApp me on 082 000 0000 urgently.' },
{ slug:'verify-your-account', title:'"Verify your account" phishing',
summary:'A message says your account will be blocked unless you click and confirm.',
how:'You get an SMS or email that looks official. It says your account is suspended or that there has been unusual activity. You are told to click a link and "verify" your details. The page copies the real one and asks for your PIN, OTP or password. That is the whole trick.',
flags:['The link is not the official website address','It creates panic: blocked, suspended, closed',
'It asks for your PIN, OTP, password or full card number','The address is padded with words like "secure" or "verify"',
'It arrives from a number or address you do not recognise'],
todo:['Do not click the link.','Never give anyone your PIN or OTP. No bank or Mukuru agent will ever ask for it.',
'Open the official app or phone the number printed on your card.','Report the message.'],
example:'Dear customer, your account has been suspended due to unusual activity. Verify your account within 24 hours to avoid closure: http://mukuru-secure-verify.xyz/login' },
{ slug:'fake-links', title:'Links that only look real',
summary:'A website address that copies a real one, so you trust it at a glance.',
how:'Scammers buy an address that is close to the real one — a real name hidden inside a longer address, a swapped letter, or a cheap ending such as .xyz. The page is built to look exactly like the real site so you type your details into it.',
flags:['A real company name appears inside a longer address, not at the start',
'Extra words such as "secure", "login" or "update" in the address',
'The ending is unusual for a bank or a big company','The link arrives in a message that was not expected',
'A short link hides where it actually goes'],
todo:['Do not tap the link. Read the address carefully instead.',
'Type the official address yourself, or use the app you already have.',
'If you already typed your details in, phone your bank immediately.','Report the message.'],
example:'Your Mukuru transfer is on hold. Confirm your details here to release it: http://mukuru.com.release-funds.top/confirm' },
{ slug:'romance-scams', title:'Romance and "emergency" scams',
summary:'Someone you met online needs money for an emergency, a ticket or a customs fee.',
how:'The relationship is built slowly and warmly, always online. Then a crisis arrives: a hospital bill, a visa, a plane ticket, or goods stuck at customs. You are asked to send money, often urgently and often in secret. The crisis never ends.',
flags:['They will not meet in person or on a video call','Money is needed urgently, for an emergency',
'They ask you to keep it between the two of you','Payment is wanted by gift card, crypto or a personal wallet',
'The story changes each time you ask a question'],
todo:['Stop and talk to someone you trust before sending anything.',
'Never send money to someone you have not met in person.','Reverse image search their photo.',
'Report it. You are not the first, and you will not be the last.'],
example:'My love, I am stuck at the hospital and they will not release me until the bill is paid. Please send money today, R4500, and do not tell your family yet, they will not understand. I will pay you back when I arrive.' },
{ slug:'prize-and-refund-scams', title:'Prizes, refunds and "you have won"',
summary:'Money you were not expecting, that you must pay to release.',
how:'You are told you have won a competition, or that a refund is waiting. To release it you must pay a small "release fee", or confirm your banking details. There is no prize and no refund — only the fee you paid, and a bank account now known to a stranger.',
flags:['You do not remember entering anything','You must pay to receive money',
'They ask for your bank details or PIN to "pay you"','There is a deadline, usually within hours',
'The sender is a personal number, not an official channel'],
todo:['You never pay to receive a prize. Ever.','Do not share your banking details or PIN.',
'Check the organisation on its official website, found yourself.','Report the message.'],
example:'Congratulations! Your number has won R50,000 in the Mukuru customer lucky draw. To claim your prize, pay a release fee of R250 and confirm your banking details today. Do not tell anyone or you may lose your winnings.' }
];
function scamBySlug(slug){
for(var i = 0; i < SCAMS.length; i++) if(SCAMS[i].slug === slug) return SCAMS[i];
return null;
}

/* ══ customer screens ══ */
/* ══════════════════ B2 · CUSTOMER SCREENS ══════════════════ */
var CUST = {};
CUST.check = function(){
var recent = state.history.slice(0, 3);
var unread = unreadCount('customer');
var html = '<h1>' + esc(t('home.title')) + '</h1>'
+ '<p class="lead">' + esc(t('home.lead')) + '</p>';
if(unread){
html += '<a class="notice info" style="display:flex;gap:10px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" href="' + pathFor('alerts') + '">' + svg('bell','ico-lg')
+ '<span><b>' + unread + ' new alert' + (unread > 1 ? 's' : '') + '</b><br>'
+ '<span class="small">' + esc(t('alerts.from')) + '</span></span></a>';
}
html += '<div id="checkNote"></div>'
+ '<label class="field" for="msgInput"><span>' + esc(t('home.message')) + '</span></label>'
+ '<textarea id="msgInput" spellcheck="false" autocomplete="off" placeholder="' + esc(t('home.placeholder')) + '"></textarea>'
+ '<div style="margin-top:12px">'
+ '<button class="btn primary" id="btnCheck">' + svg('search') + esc(t('home.check')) + '</button>'
+ '<button class="btn outline" id="btnPaste">' + esc(t('home.paste')) + '</button></div>'
+ '<div class="btnrow" style="margin-top:14px">'
+ '<a class="btn outline" href="' + pathFor('send') + '">' + svg('send') + esc(t('home.send')) + '</a>'
+ '<a class="btn outline" href="' + pathFor('library') + '">' + svg('book') + esc(t('home.library')) + '</a></div>';
if(recent.length){
html += '<div class="section-head"><h2>' + esc(t('home.recent')) + '</h2>'
+ '<a class="btn ghost" style="width:auto;min-height:auto;padding:6px" href="' + pathFor('history') + '">'
+ esc(t('history.title')) + svg('chevron') + '</a></div>';
recent.forEach(function(h){
html += '<button class="row tone-' + toneOf(h.verdict) + '" data-history="' + esc(h.id) + '">'
+ '<span class="dot"></span><span class="grow"><b>' + esc(verdictWord(h.verdict)) + '</b>'
+ '<span>' + esc(h.excerpt || h.type) + ' · ' + esc(timeAgo(h.created_at)) + '</span></span>'
+ '<span class="score">' + Math.round(h.score*100) + '</span></button>';
});
}
html += '<p class="tiny" style="margin-top:22px">' + esc(t('home.trust')) + '</p>'
+ '<p class="tiny" style="margin-top:7px">' + esc(t('home.demo')) + '</p>';
return html;
};
CUST.checking = function(kind){
return '<div class="centre" style="padding-top:66px">'
+ '<div class="spinner" role="status" aria-label="' + esc(t('checking.title')) + '"></div>'
+ '<h1 style="margin-top:24px">' + esc(t('checking.title')) + '</h1>'
+ '<p class="lead">' + esc(kind === 'transaction' ? t('checking.transaction') : t('checking.message')) + '</p>'
+ '<p class="tiny" style="margin-top:13px">' + esc(t('checking.patience')) + '</p></div>';
};
CUST.verdict = function(){
var r = state.current;
if(!r) return '<div class="centre">' + svg('compass','ico-lg') + '<h2 style="margin-top:14px">'
+ esc(t('error.empty')) + '</h2></div>';
var tone = toneOf(r.verdict), offline = r.debug && r.debug.offline, html = '';
html += '<p class="sr-only" aria-live="assertive" aria-atomic="true">'
+ esc(verdictWord(r.verdict) + '. ' + r.instruction + '. ' + r.reason_text.join('. ')) + '</p>'
+ '<div class="verdict tone-' + tone + '">'
+ '<span class="glyph">' + svg(verdictIconName(r.verdict)) + '</span>'
+ '<span class="word">' + esc(verdictWord(r.verdict)) + '</span>'
+ '<span class="instruction">' + esc(r.instruction) + '</span></div>'
+ '<div class="meter tone-' + tone + '">'
+ '<div class="track" role="meter" aria-valuenow="' + Math.round(r.score*100) + '" aria-valuemin="0"'
+ ' aria-valuemax="100" aria-label="Risk level"><div class="fill" style="width:'
+ Math.max(4, Math.round(r.score*100)) + '%"></div></div>'
+ '<div class="scale"><span>Low</span><span>Check first</span><span>High</span></div></div>';
if(r.verdict === 'looks_genuine')
html += '<p class="tiny" style="margin-top:11px;text-align:center">' + esc(t('verdict.guarantee')) + '</p>';
if(offline)
html += '<div class="notice plain" style="margin-top:13px">' + esc(t('verdict.offline')) + '</div>';
if(state.currentText){
html += '<div class="section-head"><h2>' + esc(t('verdict.message')) + '</h2></div>'
+ renderHighlighted(state.currentText, r.highlights || []);
}
if(r.display_domains && r.display_domains.length){
html += '<div class="section-head"><h2>' + esc(t('verdict.domains')) + '</h2></div>';
r.display_domains.forEach(function(d){
html += '<span class="domain">' + esc(d) + '</span>';
});
html += '<p class="tiny" style="margin-top:7px">' + esc(t('verdict.domain.warning')) + '</p>';
}
html += '<div class="section-head"><h2>' + esc(t('verdict.why')) + '</h2></div>'
+ '<div class="card"><ul class="reasons">';
r.reason_text.forEach(function(reason, i){
html += '<li><span class="num">' + (i+1) + '</span><span>' + esc(reason) + '</span></li>';
});
html += '</ul></div>';
if(r.next_steps && r.next_steps.length){
html += '<div class="section-head"><h2>' + esc(t('verdict.what_to_do')) + '</h2></div><ol class="steps">';
r.next_steps.forEach(function(s){ html += '<li>' + esc(s) + '</li>'; });
html += '</ol>';
}
if(r.cooling_off_seconds)
html += '<div class="notice warn" style="margin-top:16px">'
+ esc(t('verdict.cooling', { min:Math.round(r.cooling_off_seconds/60) })) + '</div>';
var entry = findHistory(r.id), reported = entry && entry.reported, appealed = entry && entry.appealed;
html += '<div style="margin-top:20px">'
+ '<button class="btn" id="btnListen">' + svg('speaker') + '<span>' + esc(t('verdict.listen')) + '</span></button>'
+ '<button class="btn danger" id="btnReport"' + (reported ? ' disabled' : '') + '>'
+ esc(reported ? t('verdict.reported') : t('verdict.report')) + '</button>'
+ '<button class="btn" id="btnWarn">' + esc(t('verdict.warn')) + '</button>'
+ '<button class="btn ghost" id="btnDeleteCheck">' + esc(t('verdict.delete')) + '</button></div>';
var scam = r.learn_more ? scamBySlug(r.learn_more) : null;
if(scam){
html += '<a class="notice info" style="display:flex;gap:11px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" href="' + pathFor('scam', { slug:scam.slug }) + '">'
+ svg(SCAM_ICON[scam.slug],'ico-lg') + '<span><b>' + esc(t('verdict.learn')) + '</b><br>'
+ '<span class="small">' + esc(scam.title) + '</span></span></a>';
}
html += '<div style="margin-top:16px;text-align:center">'
+ '<button class="btn ghost" id="btnAppeal" style="max-width:320px;margin:0 auto"'
+ (appealed ? ' disabled' : '') + '>'
+ esc(appealed ? t('verdict.appealed') : t('verdict.appeal')) + '</button>'
+ '<p class="tiny" style="margin-top:9px">' + esc(t('verdict.checked')) + ' '
+ esc(new Date(r.created_at).toLocaleString('en-ZA')) + ' · <span class="mono">' + esc(r.id) + '</span></p></div>';
return html;
};
function renderHighlighted(text, highlights){
if(!highlights || !highlights.length) return '<div class="msg">' + esc(text) + '</div>';
var merged = [], sorted = highlights.filter(function(h){
return h.end > h.start && h.start >= 0 && h.end <= text.length;
}).sort(function(a,b){ return a.start - b.start; });
sorted.forEach(function(h){
var last = merged[merged.length-1];
if(last && h.start < last.end) last.end = Math.max(last.end, h.end);
else merged.push({ start:h.start, end:h.end, code:h.code });
});
var out = '', cursor = 0;
merged.forEach(function(h){
if(h.start > cursor) out += esc(text.slice(cursor, h.start));
var sev = (h.code === 'UPFRONT_FEE' || h.code === 'ASKS_FOR_CREDENTIALS') ? 'high' : 'mid';
out += '<mark data-sev="' + sev + '">' + esc(text.slice(h.start, h.end)) + '</mark>';
cursor = h.end;
});
if(cursor < text.length) out += esc(text.slice(cursor));
return '<div class="msg">' + out + '</div>';
}
CUST.send = function(){
var purposes = ['family','bills','school_or_rent','buying_goods','fee_for_job_or_visa',
'fee_to_claim_prize_or_loan','someone_met_online','other'];
var html = '<h1>' + esc(t('send.title')) + '</h1><p class="lead">' + esc(t('send.lead')) + '</p>'
+ '<div id="sendNote"></div>'
+ '<label class="field"><span>' + esc(t('send.recipient')) + '</span></label><div class="pills">'
+ '<button class="pill" id="modeSaved" aria-pressed="true">' + esc(t('send.saved')) + '</button>'
+ '<button class="pill" id="modeNew" aria-pressed="false">' + esc(t('send.new')) + '</button></div>'
+ '<div id="savedBlock"><label class="field"><span class="sr-only">Saved</span><select id="recipientSelect">';
state.recipients.forEach(function(r){
html += '<option value="' + esc(r.id) + '">' + esc(r.name) + ' · ' + esc(r.country) + '</option>';
});
html += '</select></label></div>'
+ '<div id="newBlock" class="hidden">'
+ '<label class="field"><span>' + esc(t('send.name')) + '</span>'
+ '<input type="text" id="newName" autocomplete="off" placeholder="e.g. Blessing Ncube"></label>'
+ '<label class="field"><span>' + esc(t('send.country')) + '</span><select id="newCountry">'
+ '<option>ZW</option><option>MW</option><option>MZ</option><option>ZM</option><option>ZA</option>'
+ '<option>Other</option></select></label></div>'
+ '<label class="field"><span>' + esc(t('send.amount')) + '</span>'
+ '<input type="number" id="amount" inputmode="decimal" min="1" step="10" placeholder="R 0"></label>'
+ '<label class="field"><span>' + esc(t('send.purpose')) + '</span><select id="purpose">';
purposes.forEach(function(p){ html += '<option value="' + p + '">' + esc(t('purpose.' + p)) + '</option>'; });
html += '</select></label>'
+ '<label class="field"><span>' + esc(t('send.note')) + '</span>'
+ '<textarea id="sendNoteText" style="min-height:90px" placeholder="Paste anything they told you"></textarea></label>'
+ '<div style="margin-top:18px"><button class="btn primary" id="btnCheckPayment">'
+ svg('search') + esc(t('send.check')) + '</button></div>'
+ '<p class="tiny" style="margin-top:20px">' + esc(t('send.privacy')) + '</p>';
return html;
};
CUST.library = function(){
var html = '<h1>' + esc(t('library.title')) + '</h1><p class="lead">' + esc(t('library.lead')) + '</p>'
+ '<div style="margin-top:18px">';
SCAMS.forEach(function(s){
html += '<a class="row" href="' + pathFor('scam', { slug:s.slug }) + '">'
+ '<span style="width:26px;color:var(--brand)">' + svg(SCAM_ICON[s.slug],'ico-lg') + '</span>'
+ '<span class="grow"><b>' + esc(s.title) + '</b><span>' + esc(s.summary) + '</span></span>'
+ '<span style="color:var(--faint)">' + svg('chevron') + '</span></a>';
});
html += '</div><p class="tiny" style="margin-top:22px">These guides are written for the demo. Before a '
+ 'real launch every line of scam wording needs review by first-language speakers.</p>';
return html;
};
CUST.scam = function(slug){
var s = scamBySlug(slug);
if(!s) return '<div class="centre">' + svg('search','ico-lg') + '<h2 style="margin-top:13px">'
+ esc(t('error.notfound')) + '</h2></div>';
var html = '<a class="btn ghost" style="width:auto;padding:6px 0" href="' + pathFor('library') + '">'
+ svg('back') + esc(t('library.back')) + '</a>'
+ '<div style="margin-top:14px;display:flex;align-items:center;gap:12px;color:var(--brand)">'
+ svg(SCAM_ICON[s.slug],'ico-lg') + '<h1 style="font-size:1.28em;color:var(--ink)">' + esc(s.title) + '</h1></div>'
+ '<p class="lead">' + esc(s.summary) + '</p>'
+ '<div class="section-head"><h2>' + esc(t('library.how')) + '</h2></div><p>' + esc(s.how) + '</p>'
+ '<div class="section-head"><h2>' + esc(t('library.flags')) + '</h2></div><ul class="reasons">';
s.flags.forEach(function(f, i){ html += '<li><span class="num">' + (i+1) + '</span><span>' + esc(f) + '</span></li>'; });
html += '</ul><div class="section-head"><h2>' + esc(t('library.do')) + '</h2></div><ol class="steps">';
s.todo.forEach(function(x){ html += '<li>' + esc(x) + '</li>'; });
html += '</ol><div class="section-head"><h2>' + esc(t('library.example')) + '</h2></div>'
+ '<div class="msg">' + esc(s.example) + '</div>'
+ '<div style="margin-top:14px"><button class="btn primary" id="btnTryExample" data-example="'
+ esc(s.example) + '">' + esc(t('library.try')) + '</button></div>';
return html;
};
CUST.alerts = function(){
var list = alertsFor('customer');
var html = '<h1>' + esc(t('alerts.title')) + '</h1>';
if(!list.length){
return html + '<div class="centre"><span style="display:flex;justify-content:center;color:var(--faint)">'
+ svg('bell','ico-lg') + '</span><h2 style="margin-top:14px">' + esc(t('alerts.empty')) + '</h2>'
+ '<p class="small" style="margin-top:9px">' + esc(t('alerts.empty.body')) + '</p></div>';
}
html += '<div style="margin-top:18px">';
list.forEach(function(a){
html += '<div class="card"' + (a.read ? '' : ' style="border-color:var(--brand-line);background:var(--brand-soft)"') + '>'
+ '<div style="display:flex;gap:11px;align-items:flex-start">'
+ '<span style="color:' + (a.kind === 'block' ? 'var(--high)' : 'var(--brand)') + '">'
+ svg(a.kind === 'block' ? 'triangle' : 'shield','ico-lg') + '</span>'
+ '<span style="flex:1;min-width:0"><b style="display:block;font-size:.95em">' + esc(a.title) + '</b>'
+ '<span class="small" style="display:block;margin-top:5px">' + esc(a.body) + '</span>'
+ '<span class="tiny" style="display:block;margin-top:8px">' + esc(timeAgo(a.at))
+ (a.read ? '' : ' · <span class="badge">' + esc(t('alerts.new')) + '</span>') + '</span></span></div></div>';
});
html += '</div><div style="margin-top:18px">'
+ '<button class="btn outline" id="btnMarkRead">' + esc(t('alerts.markRead')) + '</button>'
+ '<button class="btn ghost" id="btnClearAlerts">' + esc(t('alerts.clear')) + '</button></div>';
return html;
};
CUST.history = function(){
var html = '<h1>' + esc(t('history.title')) + '</h1>';
if(!state.history.length){
return html + '<div class="centre"><span style="display:flex;justify-content:center;color:var(--faint)">'
+ svg('folder','ico-lg') + '</span><h2 style="margin-top:14px">' + esc(t('history.empty')) + '</h2></div>'
+ '<a class="btn primary" href="' + pathFor('check') + '">' + esc(t('tab.check')) + '</a>';
}
html += '<div class="card" style="margin-top:14px;text-align:center">'
+ '<div style="font-size:2.5em;font-weight:800;line-height:1;color:var(--low)">'
+ state.history.filter(function(h){ return h.verdict === 'high_risk'; }).length + '</div>'
+ '<div class="eyebrow" style="margin-top:7px">' + esc(t('history.stopped')) + '</div></div>'
+ '<div style="margin-top:16px">';
state.history.forEach(function(h){
html += '<button class="row tone-' + toneOf(h.verdict) + '" data-history="' + esc(h.id) + '">'
+ '<span class="dot"></span><span class="grow"><b>' + esc(verdictWord(h.verdict))
+ (h.reported ? ' · reported' : '') + (h.appealed ? ' · appealed' : '') + '</b>'
+ '<span>' + esc(h.excerpt || h.type) + ' · ' + esc(timeAgo(h.created_at)) + '</span></span>'
+ '<span class="score">' + Math.round(h.score*100) + '</span></button>';
});
html += '</div><p class="tiny" style="margin-top:18px">' + esc(t('history.masked')) + '</p>'
+ '<div style="margin-top:14px"><button class="btn danger" id="btnClearHistory">'
+ esc(t('history.clear')) + '</button></div>' + storageNotice();
return html;
};
CUST.settings = function(){
var s = state.settings, sess = state.session || {};
var html = '<h1>' + esc(t('settings.title')) + '</h1>'
+ '<div class="card" style="margin-top:14px">'
+ '<div class="eyebrow">' + esc(t('settings.account')) + '</div>'
+ '<div style="display:flex;gap:12px;align-items:center;margin-top:11px">'
+ '<span class="avatar">' + esc(initials(sess.name)) + '</span>'
+ '<span><b style="display:block">' + esc(sess.name || '') + '</b>'
+ '<span class="small">' + esc(sess.email || '') + '</span></span></div>'
+ '<button class="btn outline" id="btnSwitch" style="margin-top:14px">' + esc(t('settings.switch')) + '</button></div>';
html += '<div class="section-head"><h2>' + esc(t('settings.language')) + '</h2></div><div class="pills">';
LANGS.forEach(function(l){
html += '<button class="pill" data-lang="' + l.code + '" aria-pressed="' + (s.lang === l.code) + '">'
+ esc(l.label) + '</button>';
});
html += '</div>';
if(!isReviewed(s.lang)) html += '<div class="notice warn" style="margin-top:11px">' + esc(t('settings.review')) + '</div>';
html += '<div class="section-head"><h2>' + esc(t('settings.text')) + '</h2></div><div class="pills">'
+ ['normal','large','huge'].map(function(v){
return '<button class="pill" data-text="' + v + '" aria-pressed="' + (s.text === v) + '">'
+ esc(t('settings.text.' + v)) + '</button>'; }).join('') + '</div>'
+ '<div class="msg" style="margin-top:11px">Do not click. Do not reply.</div>';
html += '<div class="section-head"><h2>' + esc(t('settings.theme')) + '</h2></div><div class="pills">'
+ ['system','light','dark'].map(function(v){
return '<button class="pill" data-theme="' + v + '" aria-pressed="' + (s.theme === v) + '">'
+ esc(t('settings.theme.' + v)) + '</button>'; }).join('') + '</div>';
html += '<div class="section-head"><h2>' + esc(t('settings.read')) + '</h2></div><div class="pills">'
+ '<button class="pill" id="toggleRead" aria-pressed="' + s.readAloud + '">'
+ (s.readAloud ? 'On' : 'Off') + '</button></div>'
+ '<p class="tiny" style="margin-top:7px">' + esc(t('settings.read.hint')) + '</p>';
html += '<div class="section-head"><h2>' + esc(t('settings.api')) + '</h2></div>'
+ '<div class="notice ' + (connection === 'api' ? 'info' : 'plain') + '">'
+ esc(connection === 'api' ? t('settings.api.online') : t('settings.api.offline')) + '</div>'
+ '<label class="field"><span>' + esc(t('settings.api.url')) + '</span>'
+ '<input type="url" id="apiUrl" value="' + esc(s.api) + '" spellcheck="false"></label>';
html += '<div class="section-head"><h2>' + esc(t('settings.privacy')) + '</h2></div>'
+ '<p class="small">' + esc(t('settings.privacy.body')) + '</p>'
+ '<div class="section-head"><h2>' + esc(t('settings.data')) + '</h2></div>'
+ '<button class="btn danger" id="btnDeleteAll">' + esc(t('settings.delete')) + '</button>'
+ '<div class="section-head"><h2>' + esc(t('settings.about')) + '</h2></div>'
+ '<p class="tiny">Detection is a risk signal, not a guarantee. Every verdict shows its reasons and '
+ 'offers "This looks wrong" so false alarms can be corrected.</p>';
return html;
};

/* ══ history helpers ══ */
/* ══════════════════ B6 · CUSTOMER FLOW ══════════════════ */
function findHistory(id){
for(var i = 0; i < state.history.length; i++) if(state.history[i].id === id) return state.history[i];
return null;
}
function recordCheck(result, sourceText){
state.current = result;
state.currentText = sourceText || '';
setCurrent(result, sourceText);
state.history = [{
id:result.id, type:result.type, verdict:result.verdict, score:result.score,
created_at:result.created_at,
excerpt:sourceText ? maskExcerpt(sourceText)
: (result.display_domains && result.display_domains.length
? result.display_domains.join(', ')
: (result.type === 'transaction' ? 'Payment check' : 'Link check')),
reported:false, appealed:false, result:result, text:sourceText || ''
}].concat(state.history.filter(function(h){ return h.id !== result.id; })).slice(0, 50);
if(result.verdict === 'high_risk') state.lastRiskyCheckAt = result.created_at;
saveState();
}
function markEntry(id, patch){
state.history.forEach(function(h){
if(h.id === id) for(var k in patch) if(patch.hasOwnProperty(k)) h[k] = patch[k];
});
saveState();
}

/* ══ screen wiring ══ */
function wireScreen(screen, name){
screen.querySelectorAll('[data-history]').forEach(function(el){
el.addEventListener('click', function(){
var entry = findHistory(el.getAttribute('data-history'));
if(entry && entry.result){
setCurrent(entry.result, entry.text || '');
goCustomer('verdict');
}
});
});
if(name === 'check') wireCheck();
if(name === 'send') wireSend();
if(name === 'verdict') wireVerdict();
if(name === 'settings') wireCustomerSettings(screen);
if(name === 'history') wireHistoryScreen();
if(name === 'alerts') wireAlertsScreen();
if(name === 'scam') wireScamDetail();
}
function wireCheck(){
var input = $('msgInput'), note = $('checkNote');
function noteBox(msg){
note.innerHTML = msg ? '<div class="notice warn" role="alert" style="margin-top:14px">' + esc(msg) + '</div>' : '';
}
$('btnCheck').addEventListener('click', function(){
var text = input.value.trim();
if(!text){ noteBox(t('error.empty')); input.focus(); return; }
noteBox('');
beginCheck('message', text);
});
$('btnPaste').addEventListener('click', function(){
if(!navigator.clipboard || !navigator.clipboard.readText){ noteBox(t('error.invalid')); return; }
navigator.clipboard.readText().then(function(clip){
if(!clip || !clip.trim()){ noteBox(t('error.empty')); return; }
input.value = clip.trim(); noteBox(''); input.focus();
}).catch(function(){ noteBox(t('error.invalid')); });
});
var shared = sharedPayload();
if(shared){
input.value = shared;
beginCheck('message', shared);
}
}
function wireSend(){
var mode = 'saved';
$('modeSaved').addEventListener('click', function(){
mode = 'saved';
$('modeSaved').setAttribute('aria-pressed','true'); $('modeNew').setAttribute('aria-pressed','false');
$('savedBlock').classList.remove('hidden'); $('newBlock').classList.add('hidden');
});
$('modeNew').addEventListener('click', function(){
mode = 'new';
$('modeNew').setAttribute('aria-pressed','true'); $('modeSaved').setAttribute('aria-pressed','false');
$('newBlock').classList.remove('hidden'); $('savedBlock').classList.add('hidden');
});
$('btnCheckPayment').addEventListener('click', function(){
var note = $('sendNote'), amount = Number($('amount').value), name = $('newName').value.trim();
function fail(msg){
note.innerHTML = '<div class="notice warn" role="alert" style="margin-top:14px">' + esc(msg) + '</div>';
}
if(!isFinite(amount) || amount <= 0){ fail(t('send.amount_required')); return; }
if(mode === 'new' && !name){ fail(t('send.name_required')); return; }
note.innerHTML = '';
var input = {
recipient_id: mode === 'saved' ? $('recipientSelect').value : undefined,
new_recipient: mode === 'new' ? { name:name, country:$('newCountry').value } : undefined,
amount:amount, currency:'ZAR', purpose:$('purpose').value,
note:$('sendNoteText').value.trim() || null, language:state.settings.lang
};
var ctx = {
recipients:state.recipients,
history:state.sends.map(function(s){
return { recipient_id:s.recipient_id, amount:s.amount, created_at:s.created_at }; }),
lastRiskyCheckAt:state.lastRiskyCheckAt
};
state.sends.push({ recipient_id:input.recipient_id || 'rcp_new', amount:amount,
created_at:new Date().toISOString() });
saveState();
beginCheck('transaction',
'Payment of ' + money(amount) + ' · ' + t('purpose.' + input.purpose),
{ input:input, ctx:ctx });
});
}
function wireVerdict(){
var r = state.current;
if(!r) return;
if($('btnListen')) $('btnListen').addEventListener('click', function(){
var btn = $('btnListen');
if(isSpeaking()){ stopSpeaking(); btn.innerHTML = svg('speaker') + '<span>' + esc(t('verdict.listen')) + '</span>'; return; }
var text = verdictWord(r.verdict) + '. ' + r.instruction + '. ' + r.reason_text.join('. ');
if(speak(text)) btn.innerHTML = svg('stop') + '<span>' + esc(t('verdict.stop')) + '</span>';
});
if($('btnReport')) $('btnReport').addEventListener('click', function(){
markEntry(r.id, { reported:true });
apiReport(r.id);
pushAlert('staff', 'Customer report', verdictWord(r.verdict) + ' — '
+ (r.display_domains.length ? r.display_domains.join(', ') : 'message check')
+ '. Check ' + r.id + '.', 'report');
toast(t('toast.reported'), 'ok');
renderCustomer();
});
if($('btnWarn')) $('btnWarn').addEventListener('click', function(){
var scam = r.learn_more ? scamBySlug(r.learn_more) : null;
var lines = [
'Warning from Ntiyiso: ' + verdictWord(r.verdict) + '.', r.instruction,
r.display_domains && r.display_domains.length ? 'Do not open: ' + r.display_domains.join(', ') : '',
scam ? 'This looks like "' + scam.title + '".' : '',
'If you already sent money, phone your bank on the number on your card.'
].filter(Boolean).join('\n');
if(navigator.share){ navigator.share({ text:lines }).catch(function(){}); return; }
if(!navigator.clipboard) return;
navigator.clipboard.writeText(lines).then(function(){ toast(t('toast.copied'), 'ok'); }).catch(function(){});
});
if($('btnDeleteCheck')) $('btnDeleteCheck').addEventListener('click', function(){
state.history = state.history.filter(function(h){ return h.id !== r.id; });
state.current = null; state.currentText = ''; saveState();
toast(t('toast.deleted')); goCustomer('check');
});
if($('btnAppeal')) $('btnAppeal').addEventListener('click', function(){
markEntry(r.id, { appealed:true });
apiFeedback(r.id, 'looks_wrong');
pushAlert('staff', 'Customer appeal', 'A customer says check ' + r.id + ' (' + verdictWord(r.verdict)
+ ') looks wrong. Worth a look.', 'appeal');
toast(t('verdict.appealed'), 'ok'); renderCustomer();
});
}
function wireHistoryScreen(){
if(!$('btnClearHistory')) return;
$('btnClearHistory').addEventListener('click', function(){
if(!confirm(t('history.confirm'))) return;
state.history = []; state.current = null; state.currentText = '';
saveState(); toast(t('toast.cleared')); renderCustomer();
});
}
function wireAlertsScreen(){
if($('btnMarkRead')) $('btnMarkRead').addEventListener('click', function(){
markAlertsRead('customer'); renderCustomer();
});
if($('btnClearAlerts')) $('btnClearAlerts').addEventListener('click', function(){
state.alerts = state.alerts.filter(function(a){ return a.to !== 'customer'; });
saveAlerts(); renderAlertDot(); renderCustomer();
});
}
function wireScamDetail(){
if(!$('btnTryExample')) return;
$('btnTryExample').addEventListener('click', function(){
beginCheck('message', $('btnTryExample').getAttribute('data-example'));
});
}
function wireCustomerSettings(screen){
screen.querySelectorAll('[data-lang]').forEach(function(b){
b.addEventListener('click', function(){ state.settings.lang = b.getAttribute('data-lang');
saveState(); applyDocument(); renderCustomer(); });
});
screen.querySelectorAll('[data-text]').forEach(function(b){
b.addEventListener('click', function(){ state.settings.text = b.getAttribute('data-text');
saveState(); applyDocument(); renderCustomer(); });
});
screen.querySelectorAll('[data-theme]').forEach(function(b){
b.addEventListener('click', function(){ state.settings.theme = b.getAttribute('data-theme');
saveState(); applyDocument(); renderCustomer(); });
});
if($('toggleRead')) $('toggleRead').addEventListener('click', function(){
state.settings.readAloud = !state.settings.readAloud; saveState(); renderCustomer(); });
if($('apiUrl')) $('apiUrl').addEventListener('change', function(){
state.settings.api = $('apiUrl').value.trim() || DEFAULT_API;
connection = 'unknown'; saveState(); toast('API address saved.'); });
if($('btnSwitch')) $('btnSwitch').addEventListener('click', function(){ signOut(); });
if($('btnDeleteAll')) $('btnDeleteAll').addEventListener('click', function(){
if(!confirm(t('history.confirm'))) return;
try{ localStorage.removeItem(CUST_KEY); }catch(e){}
state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
state.history = []; state.current = null; state.currentText = ''; state.lastRiskyCheckAt = null;
applyDocument(); toast(t('settings.deleted'), 'ok');
});
}

/* ══ auth state ══ */
var authRole = null, authMode = 'signin';

/* ══ auth note ══ */
function authFail(msg){
$('authNote').innerHTML = '<div class="notice bad" role="alert" style="margin-top:14px">' + esc(msg) + '</div>';
}

/* ══ role picker ══ */
function pickRole(role){
authRole = role;
$('rolePicker').querySelectorAll('[data-role]').forEach(function(b){
b.setAttribute('aria-pressed', String(b.getAttribute('data-role') === role));
});
$('authStep1').classList.add('hidden');
$('authStep2').classList.remove('hidden');
$('authTitle').textContent = role === 'staff' ? t('auth.staffTitle') : t('auth.customerTitle');
$('authSub').textContent = role === 'staff' ? t('auth.staffNote') : '';
['staffCodeBlock','staffCodeBlockIn'].forEach(function(id){
var el = document.getElementById(id);
if(el) el.classList.toggle('hidden', role !== 'staff');
});
var hint = $('staffCodeHint');
if(hint) hint.innerHTML = 'Prototype code for this demo: <b class="mono">' + esc(CONFIG.staffCode) + '</b>';
setAuthMode('signin');
fillI18n(custRoot());
}

/* ══ shared payload ══ */
function sharedPayload(){
var q = new URLSearchParams(location.search);
var parts = [q.get('text'), q.get('url'), q.get('title')].filter(Boolean);
if(!parts.length) return '';
try{ history.replaceState(null, '', location.pathname + location.hash); }catch(e){}
return parts.join(' ').trim();
}

/* ══ auth forms ══ */
function wireAuthForms(){
var suForm = $('formSignup');
if(suForm) suForm.addEventListener('submit', function(e){
e.preventDefault();
var name = $('suName').value.trim(), phone = normalisePhone($('suPhone').value);
var email = $('suEmail').value.trim().toLowerCase(), pass = $('suPass').value;
if(name.length < 2) return authFail(t('auth.errName'));
if(!phone) return authFail(t('auth.errPhone'));
if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return authFail(t('auth.errEmail'));
if(pass.length < 8) return authFail(t('auth.errPass'));
if(authRole === 'staff' && $('suStaffCode').value.trim().toUpperCase() !== CONFIG.staffCode.toUpperCase())
return authFail(t('auth.errStaffCode'));
if(findAccount(email)) return authFail(t('auth.errExists'));
var list = accounts();
list.push({ name:name, phone:phone, email:email,
pass:obfuscate(pass), role:authRole, provider:'password' });
saveAccounts(list);
startSession(list[list.length-1]);
toast(t('auth.created', { name:name.split(' ')[0] }), 'ok');
enterApp();
});
var siForm = $('formSignin');
if(siForm) siForm.addEventListener('submit', function(e){
e.preventDefault();
var email = $('siEmail').value.trim().toLowerCase(), pass = $('siPass').value;
var acc = findAccount(email);
if(!acc) return authFail(t('auth.errNoAccount'));
if(acc.pass !== obfuscate(pass)) return authFail(t('auth.errWrongPass'));
if(acc.role !== authRole) return authFail(t('auth.staffOnly'));
if(authRole === 'staff' && $('siStaffCode').value.trim().toUpperCase() !== CONFIG.staffCode.toUpperCase())
return authFail(t('auth.errStaffCode'));
startSession(acc);
toast(t('auth.welcomeBack', { name:acc.name.split(' ')[0] }), 'ok');
enterApp();
});
}

/* ══ provider block ══ */
function wireProviderBlock(){
var social = document.querySelector('#authStep2 .social');
if(!social) return;
var block = document.createElement('div');
block.id = 'providerBlock';
block.className = 'hidden';
block.style.cssText = 'margin-top:12px;padding:14px;border:1px solid var(--brand-line);'
+ 'border-radius:12px;background:var(--brand-soft)';
block.innerHTML =
'<div class="eyebrow" id="providerLabel"></div>'
+ '<label class="field"><span>' + t('auth.fullName') + '</span>'
+ '<input type="text" id="providerName" autocomplete="name" placeholder="Blessing Ncube"></label>'
+ '<label class="field"><span>' + t('auth.email') + '</span>'
+ '<input type="email" id="providerEmail" autocomplete="email" placeholder="you@example.co.za"></label>'
+ '<button class="btn primary" id="providerGo" style="margin-top:14px">' + t('auth.continue') + '</button>'
+ '<p class="tiny" style="margin-top:10px">' + t('auth.socialNote') + '</p>';
social.parentNode.insertBefore(block, social.nextSibling);
var provider = null;
social.querySelectorAll('[data-social]').forEach(function(b){
b.addEventListener('click', function(){
provider = b.getAttribute('data-social');
block.classList.remove('hidden');
$('providerLabel').textContent = t('auth.withProvider', { provider:provider });
$('providerName').focus();
});
});
$('providerGo').addEventListener('click', function(){
var name = $('providerName').value.trim();
var email = $('providerEmail').value.trim().toLowerCase();
if(name.length < 2) return authFail(t('auth.errName'));
if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return authFail(t('auth.errEmail'));
var acc = findAccount(email);
if(!acc){
acc = { name:name, phone:'', email:email, pass:'', role:authRole, provider:provider };
var list = accounts(); list.push(acc); saveAccounts(list);
} else {
acc.name = name; acc.provider = provider; acc.role = authRole; saveAccounts(accounts());
}
startSession(acc);
toast(t('auth.withProvider', { provider:provider }) + ' · ' + name, 'ok');
enterApp();
});
}

/* ══ cross-page transient state ═════════════════════════════════════════
   A check now runs across three page loads (check -> checking -> verdict), so
   the text being checked and the in-flight result live in sessionStorage
   rather than a module variable. */
var TRANSIENT_KEY = 'ntiyiso.transient.v1';
function readTransient(){
  try{ return JSON.parse(sessionStorage.getItem(TRANSIENT_KEY) || '{}'); }
  catch(e){ return {}; }
}
function writeTransient(patch){
  var next = readTransient();
  for(var k in patch) if(patch.hasOwnProperty(k)) next[k] = patch[k];
  try{ sessionStorage.setItem(TRANSIENT_KEY, JSON.stringify(next)); }catch(e){}
  return next;
}
function dropTransient(key){
  var next = readTransient();
  delete next[key];
  try{ sessionStorage.setItem(TRANSIENT_KEY, JSON.stringify(next)); }catch(e){}
}

/* Passwords are only ever base64-obfuscated: this is a device-local prototype
   with no Mukuru authentication behind it. Kept in one place so both auth
   pages and the desk agree on the encoding. */
function obfuscate(p){
  try{ return btoa(unescape(encodeURIComponent(String(p)))); }
  catch(e){ return 'len' + String(p).length + ':' + String(p); }
}

/* ══ routing ════════════════════════════════════════════════════════════
   Screens are real URLs now, so a "route change" is a navigation. Everything
   in here is root-absolute and therefore works from any depth. */
var ROUTES = {
  check:    { path:'/app/check',    render:function(){ return CUST.check(); } },
  send:     { path:'/app/send',     render:function(){ return CUST.send(); } },
  library:  { path:'/app/library',  render:function(){ return CUST.library(); } },
  alerts:   { path:'/app/alerts',   render:function(){ return CUST.alerts(); } },
  checking: { path:'/app/checking', render:function(p){ return CUST.checking(p.get('kind') || 'message'); } },
  verdict:  { path:'/app/verdict',  render:function(){ return CUST.verdict(); } },
  history:  { path:'/app/history',  render:function(){ return CUST.history(); } },
  settings: { path:'/app/settings', render:function(){ return CUST.settings(); } },
  scam:     { path:'/app/scam',     render:function(p){ return CUST.scam(p.get('slug') || ''); } }
};
function pathFor(name, params){
  var def = ROUTES[name];
  if(!def) return '/app/check';
  var q = params ? '?' + new URLSearchParams(params).toString() : '';
  return def.path + q;
}
function go(path){ location.href = path; return false; }
function reload(){ location.reload(); }
function goCustomer(name, params){ go(pathFor(name, params)); }
function query(){ return new URLSearchParams(location.search); }

/* ══ session ═══════════════════════════════════════════════════════════
   Guards a page that needs a signed-in customer. Returns the session, or null
   after bouncing to sign-in - callers must check the return value. The page we
   were refused is remembered so sign-in can send us back there. */
var BOUNCE_KEY = 'session.bounce';
function requireSession(){
  var s = state.session;
  if(s && s.role === 'customer') return s;
  write(BOUNCE_KEY, location.pathname + location.search);
  go('/auth/login');
  return null;
}
function signOut(){
  endSession();
  writeTransient({ current:null, currentText:'', pending:null });
  go('/auth/login');
}

/* ══ the checked result, shared between /app/checking and /app/verdict ══ */
function setCurrent(result, text){
  state.current = result;
  state.currentText = text || '';
  writeTransient({ current:result, currentText:state.currentText });
}
function getCurrent(){
  return state.current || readTransient().current || null;
}
function getCurrentText(){
  return state.currentText || readTransient().currentText || '';
}
function clearCurrent(){
  state.current = null; state.currentText = '';
  dropTransient('current'); dropTransient('currentText');
}
/* state.current is deliberately not in localStorage, so a fresh page load on
   /app/verdict has to be handed the result the checking page left behind. */
function hydrateCurrent(){
  var tr = readTransient();
  if(!state.current && tr.current){
    state.current = tr.current;
    state.currentText = tr.currentText || '';
  }
  return state.current;
}

/* ══ check flow ═════════════════════════════════════════════════════════
   beginCheck hands the work to /app/checking, which runs it and then moves to
   /app/verdict. Everything the work needs crosses the boundary in sessionStorage
   because the work itself is a function and cannot. */
function beginCheck(kind, sourceText, payload){
  writeTransient({ pending:{ kind:kind, text:sourceText || '', payload:payload || null } });
  go('/app/checking?kind=' + encodeURIComponent(kind));
}
function pendingCheck(){
  var p = readTransient().pending;
  if(!p || !p.kind){ go('/app/check'); return null; }
  return p;
}
function checkWork(kind, text, payload){
  if(kind === 'transaction') return checkTransaction(payload && payload.input, payload && payload.ctx);
  var urls = extractUrls(text || '');
  if(urls.length === 1 && text === urls[0]) return checkLink(text);
  return checkMessage(text);
}
function timeToVerdict(kind){
  var started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return function(){
    try{
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var list = JSON.parse(sessionStorage.getItem('ntiyiso.ttv') || '[]');
      list.push({ kind:kind, ms:Math.round(now - started) });
      sessionStorage.setItem('ntiyiso.ttv', JSON.stringify(list.slice(-25)));
    }catch(e){}
  };
}
function runPendingCheck(pending){
  dropTransient('pending');
  var mark = timeToVerdict(pending.kind);
  return checkWork(pending.kind, pending.text, pending.payload).then(function(result){
    recordCheck(result, pending.text);
    mark();
    go('/app/verdict');
  }).catch(function(err){
    toast(errorMessage(err), 'bad');
    go(pending.kind === 'transaction' ? '/app/send' : '/app/check');
  });
}

/* ══ mounting a screen ══════════════════════════════════════════════════
   One screen per document. mountScreen() is what renderCustomer() used to be:
   fill the host, translate the i18n hooks, wire the controls, refresh the tab
   chrome. currentScreen is remembered so a re-render (after reporting, after a
   language change) knows where it is. */
var currentScreen = '';
function mountScreen(name, params){
  var host = document.getElementById('custScreen');
  if(!host) return;
  var def = ROUTES[name] || ROUTES.check;
  currentScreen = ROUTES[name] ? name : 'check';
  hydrateCurrent();
  host.innerHTML = def.render(params || query());
  fillI18n(custRoot());
  wireScreen(host, currentScreen);
  renderAlertDot();
  window.scrollTo(0, 0);
  if(state.settings.readAloud && currentScreen === 'verdict'){
    var r = state.current;
    if(r) setTimeout(function(){
      speak(verdictWord(r.verdict) + '. ' + r.instruction + '. ' + r.reason_text.join('. '));
    }, 350);
  }
}
function renderCustomer(){ mountScreen(currentScreen); }

/* ══ auth ═══════════════════════════════════════════════════════════════
   /auth/login and /auth/signup are two documents sharing one flow, so setAuthMode
   only clears the note: the page itself is the mode. */
function setAuthMode(mode){
  authMode = mode;
  var note = document.getElementById('authNote');
  if(note) note.innerHTML = '';
}
/* Wired by both auth pages: role picker, the back button, whichever form is on
   the document, and the provider block. */
function wireAuthShell(mode){
  setAuthMode(mode);
  $('rolePicker').querySelectorAll('[data-role]').forEach(function(b){
    b.addEventListener('click', function(){ pickRole(b.getAttribute('data-role')); });
  });
  $('authBack').addEventListener('click', function(){
    $('authStep2').classList.add('hidden');
    $('authStep1').classList.remove('hidden');
    $('authTitle').textContent = t('auth.welcome');
    $('authSub').textContent = t('auth.who');
  });
  wireAuthForms();
  wireProviderBlock();
  var sn = $('authStorage');
  if(sn) sn.innerHTML = storageNotice();
  fillI18n(custRoot());
}
/* After a successful sign-in or sign-up. Staff land on the desk's own sign-in
   page; a customer goes back to whichever /app page bounced them here. */
function enterApp(){
  if(state.role === 'staff'){ go('/desk/login'); return; }
  var bounce = read(BOUNCE_KEY, '');
  if(bounce.indexOf('/app/') === 0) write(BOUNCE_KEY, '');
  go(bounce.indexOf('/app/') === 0 ? bounce : '/app/check');
}

/* ══ page guards ═════════════════════════════════════════════════════════
   Every /app/* page boots the same way: load state, apply the text/theme
   preferences, refuse to render without a session, then mount one screen.
   startApp() is what the nine page scripts call. */
function startApp(name, params){
  loadState();
  loadAlerts();
  applyDocument();
  if(!requireSession()) return null;
  fillI18n(custRoot());
  var exit = document.getElementById('custExit');
  if(exit) exit.addEventListener('click', function(){ signOut(); });
  mountScreen(name, params);
  return name;
}
function has(id){ return !!document.getElementById(id); }

/* ══ public API ═════════════════════════════════════════════════════════ */
NT.store = {
  read: read, write: write, storageOk: STORAGE_OK, storageNotice: storageNotice,
  keys: { customer:CUST_KEY, accounts:ACCOUNTS_KEY, session:SESSION_KEY, alerts:ALERTS_KEY }
};

NT.cust = {
  CONFIG:CONFIG, RULES:RULES, DEFAULT_SETTINGS:DEFAULT_SETTINGS, LANGS:LANGS,
  SCAMS:SCAMS, REASONS:REASONS,
  t:t, reasonText:reasonText, isReviewed:isReviewed,
  svg:svg, SCAM_ICON:SCAM_ICON, ICON:ICON,
  esc:esc, money:money, initials:initials, timeAgo:timeAgo,
  toneOf:toneOf, verdictWord:verdictWord, verdictIconName:verdictIconName,
  scamBySlug:scamBySlug, isReviewedLang:isReviewed,
  extractUrls:extractUrls, displayDomain:displayDomain,
  checkMessage:checkMessage, checkLink:checkLink, checkTransaction:checkTransaction,
  errorMessage:errorMessage, apiReport:apiReport, apiFeedback:apiFeedback,
  state:state, connection:function(){ return connection; },
  loadState:loadState, saveState:saveState,
  loadAlerts:loadAlerts, saveAlerts:saveAlerts,
  pushAlert:pushAlert, alertsFor:alertsFor, unreadCount:unreadCount,
  markAlertsRead:markAlertsRead, renderAlertDot:renderAlertDot,
  findHistory:findHistory, recordCheck:recordCheck, markEntry:markEntry,
  renderHighlighted:renderHighlighted, storageNotice:storageNotice,
  sharedPayload:sharedPayload, read:read, write:write,
  accounts:accounts, saveAccounts:saveAccounts, findAccount:findAccount,
  normalisePhone:normalisePhone, obfuscate:obfuscate,
  startSession:startSession, endSession:endSession,
  session:function(){ return state.session; },
  applyDocument:applyDocument, custRoot:custRoot,
  fillI18n:fillI18n, toast:toast,
  speak:speak, stopSpeaking:stopSpeaking, isSpeaking:isSpeaking,
  speechAvailable:speechAvailable,
  newId:newId, maskExcerpt:maskExcerpt, apiBase:apiBase,
  SCREEN:CUST, ROUTES:ROUTES, pathFor:pathFor, go:go, reload:reload,
  goCustomer:goCustomer, query:query,
  requireSession:requireSession, signOut:signOut, startApp:startApp, has:has,
  mountScreen:mountScreen, renderCustomer:renderCustomer,
  wireCheck:wireCheck, wireSend:wireSend, wireVerdict:wireVerdict,
  wireHistoryScreen:wireHistoryScreen, wireAlertsScreen:wireAlertsScreen,
  wireScamDetail:wireScamDetail, wireCustomerSettings:wireCustomerSettings,
  beginCheck:beginCheck, pendingCheck:pendingCheck, checkWork:checkWork,
  runPendingCheck:runPendingCheck, timeToVerdict:timeToVerdict,
  setCurrent:setCurrent, getCurrent:getCurrent, getCurrentText:getCurrentText,
  clearCurrent:clearCurrent, hydrateCurrent:hydrateCurrent,
  readTransient:readTransient, writeTransient:writeTransient, dropTransient:dropTransient,
  authRole:function(){ return authRole; }, setAuthMode:setAuthMode,
  authFail:authFail, pickRole:pickRole, wireAuthShell:wireAuthShell,
  wireAuthForms:wireAuthForms, wireProviderBlock:wireProviderBlock,
  enterApp:enterApp
};
})(window);
