import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  EventInputEventName,
  type AdminResponse,
  type AdminSummary,
  type ResponseInput,
  useCreateEvent,
  useCreateResponse,
  useExportAdminResponses,
  useGetAdminResponses,
  useGetAdminSummary,
  useHealthCheck,
  getGetAdminResponsesQueryKey,
  getGetAdminSummaryQueryKey,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
type Role = 'driver' | 'rider';
type ExitKind = 'location' | 'student' | null;
type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

const days: Array<{ key: DayName; label: string }> = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
];

const arrivalTimeOptions = Array.from({ length: 33 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return formatTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
});

const departureTimeOptions = Array.from({ length: 35 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return formatTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
});
const arrivalChoices = [...arrivalTimeOptions, 'Varies'];
const departureChoices = [...departureTimeOptions, 'Varies'];

const blankSchedule = days.map(({ key }) => ({
  day: key,
  active: true,
  arrival: '8:30 AM',
  departure: '4:30 PM',
}));

const initialResponseFields: Omit<ResponseInput, 'role'> = {
  livesInSageCreek: true,
  isUofMStudent: true,
  schedule: blankSchedule,
  arrivalFlexibility: '±15 minutes is fine',
  departureFlexibility: '±15 minutes is fine',
  rideDirection: 'To campus only',
  maxDetour: null,
  seats: null,
  maxPickupWalk: '10 minutes',
  currentTransportMethod: null,
  currentCommuteDuration: null,
  minimumMonthlyCompensation: null,
  maximumMonthlyWillingnessToPay: null,
  scheduleChangeFrequency: 'A few times a month',
  dealbreaker: '',
  dealbreakerOther: null,
  intentLevel: '',
  email: null,
  phone: null,
  prefersText: false,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrer: typeof document !== 'undefined' ? document.referrer || null : null,
};

function trackEvent(
  mutate: ReturnType<typeof useCreateEvent>['mutate'],
  eventName: EventInputEventName,
  role?: Role,
  step?: number,
) {
  mutate({ data: { eventName, role: role ?? null, step: step ?? null } });
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand-mark ${light ? 'brand-light' : ''}`}>
      <span className="brand-dot" aria-hidden="true" />
      <span>Sage <b>↔</b> UofM</span>
    </span>
  );
}

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-20 py-5">
      <div className="container-wide flex items-center justify-between">
        <Link href="/" className="no-underline" data-testid="link-brand-home">
          <Brand />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          <a href="#how-it-works" className="nav-link" data-testid="link-how-it-works">How it works</a>
          <span className="nav-context">Sage Creek · U of M students</span>
          <Link href="/admin" className="nav-link" data-testid="link-admin">Admin</Link>
        </nav>
        <button
          className="menu-button md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Open navigation"
          data-testid="button-open-menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menuOpen && (
        <div className="mobile-menu md:hidden">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} data-testid="link-mobile-how">How it works</a>
          <span className="mobile-menu-context">Sage Creek · U of M students</span>
          <Link href="/admin" data-testid="link-mobile-admin">Admin</Link>
        </div>
      )}
    </header>
  );
}

function RouteIllustration() {
  return (
    <div className="route-card fade-up delay-2" aria-label="How Sage Creek Commute works">
      <div className="route-card-top">
        <span className="card-label">How it works</span>
        <span className="card-route">Sage Creek <span>↔</span> U of M</span>
      </div>
      <div className="route-map" aria-hidden="true">
        <div className="route-grid" />
        <div className="route-line" />
        <span className="map-label home">SAGE CREEK</span>
        <span className="map-label uni">U OF M</span>
        <div className="route-pin pin-one"><MapPin size={17} /></div>
        <div className="route-pin pin-two"><Navigation size={17} /></div>
      </div>
      <div className="route-card-steps">
        <div><span>1</span><p>Add your weekly schedule</p></div>
        <div><span>2</span><p>We look for overlapping commutes</p></div>
        <div><span>3</span><p>If enough matches exist, we’ll reach out</p></div>
      </div>
    </div>
  );
}

function LandingPage({ onStart }: { onStart: (role: Role) => void }) {
  const createEvent = useCreateEvent();
  useEffect(() => {
    trackEvent(createEvent.mutate, EventInputEventName.landing_viewed);
  }, []);
  const selectRole = (role: Role) => {
    trackEvent(
      createEvent.mutate,
      role === 'driver' ? EventInputEventName.driver_role_selected : EventInputEventName.rider_role_selected,
      role,
    );
    onStart(role);
  };

  return (
    <main className="site-shell">
      <PublicHeader />
      <section className="hero-section">
        <div className="container-wide hero-grid">
          <div className="hero-copy">
             <div className="eyebrow fade-up">Built around your actual class schedule</div>
             <h1 className="display-xl fade-up delay-1">Same neighbourhood.<br /><em>Same campus.</em><br />Better commute.</h1>
            <p className="hero-lede fade-up delay-2">
               We’re seeing if U of M students in Sage Creek can be matched for recurring rides based on where they live and when they actually go to campus.
            </p>
            <div className="hero-actions fade-up delay-3">
              <div className="role-choice-label">First, choose how you usually get to campus</div>
              <RoleChoiceButtons onSelect={selectRole} testPrefix="hero" />
              <span className="role-choice-helper">We’ll ask different questions based on your commute.</span>
              <span className="quiet-note"><ShieldCheck size={15} /> Takes about a minute · no commitment</span>
            </div>
          </div>
          <RouteIllustration />
        </div>
      </section>
      <section id="how-it-works" className="section-pad">
        <div className="container-wide">
          <div className="section-intro">
            <div className="eyebrow">Why this could work</div>
            <h2 className="display-lg mt-4">Built around the<br />way you actually commute.</h2>
          </div>
          <div className="feature-list">
            <Feature number="01" title="Same neighbourhood" body="Nearby students already heading to campus." />
            <Feature number="02" title="Real schedules" body="Different times on different days are built in." />
            <Feature number="03" title="Better fit" body="We’re checking where the commute actually lines up." />
          </div>
        </div>
      </section>
      <section className="privacy-section border-b-[1px]">
        <div className="container-wide privacy-row">
          <div><ShieldCheck size={18} /><span>Sage Creek only</span></div>
          <div><GraduationCap size={18} /><span>U of M students only</span></div>
          <div><LockKeyhole size={18} /><span>Your info stays private to this project</span></div>
        </div>
      </section>
      <section className="role-cta-section">
        <div className="container-wide role-cta-card mt-[40px] mb-[40px]">
          <div>
            <div className="eyebrow">Find your route</div>
            <h2>Want to see if your commute could line up?</h2>
            <p>Choose the option that describes you.</p>
          </div>
          <RoleChoiceButtons onSelect={selectRole} testPrefix="bottom" />
        </div>
      </section>
      <footer className="site-footer">
        <div className="container-wide footer-row">
          <Brand />
           <span>For Sage Creek students, by a local team.</span>
          <Link href="/admin" className="footer-admin" data-testid="link-footer-admin">Private admin <ExternalLink size={13} /></Link>
        </div>
      </footer>
    </main>
  );
}

function RoleChoiceButtons({ onSelect, testPrefix }: { onSelect: (role: Role) => void; testPrefix: string }) {
  return (
    <div className="role-choice-buttons">
      <button onClick={() => onSelect('driver')} className="btn-primary role-choice-button text-center text-[13px] justify-center items-center flex-row" data-testid={`button-${testPrefix}-driver`}>
        I drive to U of M <ArrowRight size={17} />
      </button>
      <button onClick={() => onSelect('rider')} className="btn-primary role-choice-button" data-testid={`button-${testPrefix}-rider`}>
        I need rides <ArrowRight size={17} />
      </button>
    </div>
  );
}

function Feature({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <article className="feature-item">
      <span className="feature-number">{number}</span>
      <div><h3>{title}</h3><p>{body}</p></div>
    </article>
  );
}

function Choice({
  label,
  detail,
  selected,
  onClick,
  testId,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button className={`choice ${selected ? 'selected' : ''}`} onClick={onClick} data-testid={testId} aria-pressed={selected}>
      <span><span className="choice-label">{label}</span>{detail && <span className="choice-detail">{detail}</span>}</span>
      <span className="choice-check">{selected && <Check size={14} strokeWidth={3} />}</span>
    </button>
  );
}

function QuestionFrame({
  step,
  total,
  kicker,
  title,
  subtitle,
  children,
  canContinue,
  onBack,
  onContinue,
  role,
  onChangeRole,
  continueLabel = 'Continue',
  pending = false,
}: {
  step: number;
  total: number;
  kicker: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
  role?: Role;
  onChangeRole?: () => void;
  continueLabel?: string;
  pending?: boolean;
}) {
  return (
    <div className="question-shell">
      <div className="question-top">
        <div className="question-nav-row">
          <Link href="/" className="question-brand" data-testid="link-question-brand"><Brand /></Link>
          <span className="step-count font-mono-custom">0{step + 1} <span>/ {String(total).padStart(2, '0')}</span></span>
        </div>
        <div className="progress-track" aria-label={`Step ${step + 1} of ${total}`}><div className="progress-fill" style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
        {role && onChangeRole && <div className="question-role-row"><span>{role === 'driver' ? 'Driver' : 'Rider'} · Sage Creek → U of M</span><button type="button" onClick={onChangeRole} data-testid="button-change-role">Change</button></div>}
      </div>
      <main className="question-main" key={`${step}-${title}`}>
        <div className="eyebrow">{kicker}</div>
        <h1 className="question-title mt-5">{title}</h1>
        {subtitle && <p className="question-subtitle">{subtitle}</p>}
        {children}
        <div className="question-actions">
          <button className="back-action" onClick={onBack} data-testid="button-question-back"><ArrowLeft size={16} /> Back</button>
          <button className="btn-primary" onClick={onContinue} disabled={!canContinue || pending} data-testid="button-question-continue">
            {pending ? 'Saving…' : continueLabel} {!pending && <ArrowRight size={17} />}
          </button>
        </div>
      </main>
    </div>
  );
}

function QualificationExit({ kind, onReset }: { kind: ExitKind; onReset: () => void }) {
  const isLocation = kind === 'location';
  return (
    <div className="question-shell">
      <div className="question-top"><div className="question-nav-row"><Link href="/" className="question-brand" data-testid="link-exit-brand"><Brand /></Link><span className="eyebrow">A quick note</span></div><div className="progress-track"><div className="progress-fill" style={{ width: '17%' }} /></div></div>
      <main className="question-main">
        <div className="eyebrow">Not quite the right route</div>
        <h1 className="question-title mt-5">{isLocation ? 'This first version is focused on Sage Creek.' : 'This list is for U of M students.'}</h1>
        <div className="exit-card">
          <p>{isLocation ? 'We are keeping this experience deliberately local: Sage Creek to the University of Manitoba. If that changes, we would love to hear from you.' : 'We are focused on the student commute between Sage Creek and the University of Manitoba for now. Thanks for checking.'}</p>
          <button className="btn-quiet mt-6" onClick={onReset} data-testid="button-qualification-restart">Start over <RefreshCw size={15} /></button>
        </div>
      </main>
    </div>
  );
}

function ScheduleEditor({ schedule, onChange }: { schedule: ResponseInput['schedule']; onChange: (schedule: ResponseInput['schedule']) => void }) {
  const updateDay = (day: DayName, patch: Partial<ResponseInput['schedule'][number]>) => {
    onChange(schedule.map((entry) => entry.day === day ? { ...entry, ...patch } : entry));
  };
  return (
    <div className="schedule-table">
      <div className="schedule-row head"><span>Day</span><span>Arrive campus</span><span>Leave campus</span></div>
      {days.map(({ key, label }) => {
        const current = schedule.find((entry) => entry.day === key) ?? blankSchedule[0];
        return (
          <div className="schedule-row" key={key}>
            <div className="day-toggle"><button className={`switch ${current.active ? 'on' : ''}`} onClick={() => updateDay(key, { active: !current.active })} aria-label={`${current.active ? 'Remove' : 'Add'} ${label}`} data-testid={`button-toggle-${key}`} /><span>{label}</span></div>
            {current.active ? <><select value={current.arrival} onChange={(event) => updateDay(key, { arrival: event.target.value })} aria-label={`${label} arrival`} data-testid={`select-arrival-${key}`}>
              {arrivalChoices.map((time) => <option value={time} key={time}>{time}</option>)}
            </select>
            <select value={current.departure} onChange={(event) => updateDay(key, { departure: event.target.value })} aria-label={`${label} departure`} data-testid={`select-departure-${key}`}>
              {departureChoices.map((time) => <option value={time} key={time}>{time}</option>)}
            </select></> : <div className="schedule-off">Not scheduled</div>}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(time: string) {
  const [hourString, minute] = time.split(':');
  const hour = Number(hourString);
  return `${hour > 12 ? hour - 12 : hour || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function ContactFields({ form, update }: { form: ResponseInput; update: (patch: Partial<ResponseInput>) => void }) {
  const contactValid = Boolean(form.email || form.phone);
  return (
    <div className="contact-fields">
      <div className="contact-note"><ShieldCheck size={16} /><span>We’ll only use this to contact you about Sage Creek Commute.</span></div>
      <div className="field"><label htmlFor="email"><Mail size={14} /> Email <span className="optional">or phone below</span></label><input id="email" type="email" value={form.email ?? ''} onChange={(event) => update({ email: event.target.value || null })} placeholder="you@example.com" data-testid="input-email" /></div>
      <div className="field"><label htmlFor="phone"><Phone size={14} /> Phone <span className="optional">or email above</span></label><input id="phone" type="tel" value={form.phone ?? ''} onChange={(event) => update({ phone: event.target.value || null })} placeholder="204 555 0142" data-testid="input-phone" /></div>
      <button className={`text-toggle ${form.prefersText ? 'selected' : ''}`} onClick={() => update({ prefersText: !form.prefersText })} data-testid="button-prefers-text" aria-pressed={form.prefersText}>
        <span className="toggle-box">{form.prefersText && <Check size={13} />}</span> Text is best for me
      </button>
      {!contactValid && <p className="field-error">Add an email or phone number to continue.</p>}
    </div>
  );
}

function Questionnaire({ initialRole, onComplete, onExit }: { initialRole: Role; onComplete: (response: ResponseInput) => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ResponseInput>({ ...initialResponseFields, role: initialRole });
  const [exitKind, setExitKind] = useState<ExitKind>(null);
  const submitGuard = useRef(false);
  const createResponse = useCreateResponse();
  const createEvent = useCreateEvent();
  const total = 11;
  const update = (patch: Partial<ResponseInput>) => setForm((previous) => ({ ...previous, ...patch }));

  const reset = () => {
    setForm({ ...initialResponseFields, role: initialRole, schedule: blankSchedule.map((entry) => ({ ...entry })) });
    setStep(0);
    setExitKind(null);
    submitGuard.current = false;
  };

  const goBack = () => {
    if (step === 0) { onExit(); return; }
    setStep((current) => current - 1);
  };

  const canContinue = useMemo(() => {
    if (step === 2) return form.schedule.some((day) => day.active);
    if (step === 3) return Boolean(form.arrivalFlexibility && form.departureFlexibility);
    if (step === 5) return form.role === 'driver'
      ? Boolean(form.maxDetour && form.seats)
      : Boolean(form.maxPickupWalk && form.currentTransportMethod && form.currentCommuteDuration);
    if (step === 7) return form.role === 'driver'
      ? Boolean(form.minimumMonthlyCompensation)
      : Boolean(form.maximumMonthlyWillingnessToPay);
    if (step === 10) return Boolean(form.email || form.phone);
    return true;
  }, [form, step]);

  const next = () => {
    if (!canContinue) return;
    if (step === 0 && !form.livesInSageCreek) { setExitKind('location'); return; }
    if (step === 1 && !form.isUofMStudent) { setExitKind('student'); return; }
    if (step === 10) {
      if (submitGuard.current || createResponse.isPending) return;
      submitGuard.current = true;
      const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const payload: ResponseInput = {
        ...form,
        utmSource: search.get('utm_source'),
        utmMedium: search.get('utm_medium'),
        utmCampaign: search.get('utm_campaign'),
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      };
      createResponse.mutate({ data: payload }, {
        onSuccess: () => onComplete(payload),
        onError: () => { submitGuard.current = false; },
      });
      trackEvent(createEvent.mutate, EventInputEventName.form_completed, form.role, 11);
      return;
    }
    setStep((current) => current + 1);
    trackEvent(createEvent.mutate, EventInputEventName.step_reached, form.role, step + 2);
  };

  if (exitKind) return <QualificationExit kind={exitKind} onReset={reset} />;

  const roleLabel = form.role === 'driver' ? 'Driving to campus' : 'Looking for a ride';
  const changeRole = () => {
    if (step > 0 && typeof window !== 'undefined' && !window.confirm('Changing your role will reset this questionnaire. Continue?')) return;
    onExit();
  };
  const frameRoleProps = { role: form.role, onChangeRole: changeRole };
  if (step === 0) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="First, your commute" title="Do you currently live in Sage Creek?" subtitle="This list is focused on the route between Sage Creek and the University of Manitoba." canContinue={canContinue} onBack={goBack} onContinue={next}>
    <div className="choice-grid">
      <Choice label="Yes, I do" selected={form.livesInSageCreek} onClick={() => update({ livesInSageCreek: true })} testId="choice-lives-yes" />
      <Choice label="No, not currently" selected={!form.livesInSageCreek} onClick={() => update({ livesInSageCreek: false })} testId="choice-lives-no" />
    </div>
  </QuestionFrame>;

  if (step === 1) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="One more check" title="Are you currently a U of M student?" subtitle="This list is for students making this commute to the Fort Garry campus." canContinue={canContinue} onBack={goBack} onContinue={next}>
    <div className="choice-grid">
      <Choice label="Yes, I am" selected={form.isUofMStudent} onClick={() => update({ isUofMStudent: true })} testId="choice-student-yes" />
      <Choice label="No, not currently" selected={!form.isUofMStudent} onClick={() => update({ isUofMStudent: false })} testId="choice-student-no" />
    </div>
  </QuestionFrame>;

  if (step === 2) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Your actual week" title="When are you usually on campus?" subtitle="Your schedule can be completely different each day. Choose your usual arrival and departure times." canContinue={canContinue} onBack={goBack} onContinue={next}>
    <ScheduleEditor schedule={form.schedule} onChange={(schedule) => update({ schedule })} />
    <p className="field-note mt-4">You can leave a day off if you are not usually on campus.</p>
  </QuestionFrame>;

  if (step === 3) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Flexibility" title="How much can your commute times move?" subtitle="This helps us see how closely another student’s schedule needs to match yours." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <p className="field-label">How flexible are you with your arrival time?</p>
      <div className="choice-grid">
        {['Need to be within about 10 minutes', '±15 minutes is fine', '±30 minutes is fine', 'I’m pretty flexible'].map((value) => <Choice key={value} label={value} selected={form.arrivalFlexibility === value} onClick={() => update({ arrivalFlexibility: value })} testId={`choice-arrival-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
      <p className="field-label">How flexible are you with when you leave campus?</p>
      <div className="choice-grid">
        {['Need to be within about 10 minutes', '±15 minutes is fine', '±30 minutes is fine', 'I’m pretty flexible'].map((value) => <Choice key={value} label={value} selected={form.departureFlexibility === value} onClick={() => update({ departureFlexibility: value })} testId={`choice-departure-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
    </QuestionFrame>
  );

  if (step === 4) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Direction" title="Which part of your commute would you use this for?" subtitle="Choose what would actually be useful during a normal week." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <div className="choice-grid">
        {['To campus only', 'Home only', 'Both directions', 'Depends on the day'].map((value) => <Choice key={value} label={value} selected={form.rideDirection === value} onClick={() => update({ rideDirection: value })} testId={`choice-direction-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
    </QuestionFrame>
  );

  if (step === 5 && form.role === 'driver') return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="The driver side" title="How much extra driving is reasonable?" subtitle="Assume the student lives close to your normal route." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <p className="field-label">What’s the most extra time you’d tolerate for a pickup?</p>
      <div className="choice-grid">
        {['0–2 minutes', '3–5 minutes', '6–10 minutes', '10+ minutes', 'I wouldn’t detour'].map((value) => <Choice key={value} label={value} selected={form.maxDetour === value} onClick={() => update({ maxDetour: value })} testId={`choice-detour-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
      <p className="field-label">How many students would you realistically be willing to take?</p>
      <div className="choice-grid">
        {['1', '2', '3+'].map((value) => <Choice key={value} label={value} selected={form.seats === value} onClick={() => update({ seats: value })} testId={`choice-seats-${value}`} />)}
      </div>
    </QuestionFrame>
  );

  if (step === 5) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="The rider side" title="How would pickup work for you?" subtitle="Think about the distance and habits that would actually work on a class day." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <p className="field-label">How far would you be willing to walk to meet your driver?</p>
      <div className="choice-grid">
        {['Doorstep only', '2–3 minute walk', '5 minute walk', '10 minute walk'].map((value) => <Choice key={value} label={value} selected={form.maxPickupWalk === value} onClick={() => update({ maxPickupWalk: value })} testId={`choice-walk-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
      <p className="field-label">How do you usually get to U of M now?</p>
      <div className="choice-grid">
        {['Bus', 'Family or friend drives me', 'Uber / taxi', 'I drive myself', 'A mix of these'].map((value) => <Choice key={value} label={value} selected={form.currentTransportMethod === value} onClick={() => update({ currentTransportMethod: value })} testId={`choice-transport-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
      <div className="field"><label htmlFor="duration">How long does your usual one-way trip to campus take?</label><select id="duration" value={form.currentCommuteDuration ?? ''} onChange={(event) => update({ currentCommuteDuration: event.target.value })} data-testid="select-commute-duration"><option value="">Choose one</option><option>Under 20 minutes</option><option>20–30 minutes</option><option>30–45 minutes</option><option>45–60 minutes</option><option>60+ minutes</option></select></div>
    </QuestionFrame>
  );

  if (step === 6) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Schedule reliability" title="How often does your schedule change last-minute?" subtitle="Think same-day changes to when you go to campus or when you leave." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <div className="choice-grid">
        {['Almost never', 'Maybe once a month', 'A few times a month', 'About once a week', 'Multiple times a week'].map((value) => <Choice key={value} label={value} selected={form.scheduleChangeFrequency === value} onClick={() => update({ scheduleChangeFrequency: value })} testId={`choice-schedule-change-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
    </QuestionFrame>
  );

  if (step === 7 && form.role === 'driver') return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Economics" title="What would make it worth it?" subtitle="For regularly taking the same nearby U of M student on days you’re already driving." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <p className="field-label">What’s the minimum you’d want to receive per month?</p>
      <div className="choice-grid">
        {['$20–39', '$40–59', '$60–79', '$80–99', '$100–124', '$125+', 'I wouldn’t do it'].map((value) => <Choice key={value} label={value} selected={form.minimumMonthlyCompensation === value} onClick={() => update({ minimumMonthlyCompensation: value })} testId={`choice-compensation-${value.replace(/\W/g, '').toLowerCase()}`} />)}
      </div>
    </QuestionFrame>
  );

  if (step === 7) {
    const riderPriceSubtitle = {
      'To campus only': 'For recurring rides to U of M on the days you selected, with a nearby student whose schedule fits yours.',
      'Home only': 'For recurring rides home from U of M on the days you selected, with a nearby student whose schedule fits yours.',
      'Both directions': 'For recurring rides to and from U of M on the days you selected, with a nearby student whose schedule fits yours.',
      'Depends on the day': 'For recurring rides on the parts of your week where your schedule matches another student.',
    }[form.rideDirection] ?? 'For recurring rides on the parts of your week where your schedule matches another student.';
    return (
      <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Economics" title="What would you pay each month?" subtitle={riderPriceSubtitle} canContinue={canContinue} onBack={goBack} onContinue={next}>
        <p className="field-label">What’s the most you’d realistically pay per month?</p>
        <div className="choice-grid">
          {['Under $40', '$40–59', '$60–79', '$80–99', '$100–124', '$125–149', '$150+', 'I wouldn’t pay'].map((value) => <Choice key={value} label={value} selected={form.maximumMonthlyWillingnessToPay === value} onClick={() => update({ maximumMonthlyWillingnessToPay: value })} testId={`choice-willingness-${value.replace(/\W/g, '').toLowerCase()}`} />)}
        </div>
      </QuestionFrame>
    );
  }

  if (step === 8) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="The dealbreaker" title={form.role === 'driver' ? 'What would make you least likely to do this?' : 'What would make you least likely to use this?'} subtitle="Pick the biggest concern." canContinue={canContinue} onBack={goBack} onContinue={next}>
      <div className="choice-grid">
        {(form.role === 'driver' ? ['Rider being late', 'Extra driving time', 'Having someone I don’t know in my car', 'Compensation being too low', 'My schedule changes too much', 'Insurance / liability concerns', 'Other'] : ['Driver cancellations', 'Being late to class', 'Riding with someone I don’t know', 'Price', 'Pickup inconvenience', 'My schedule changes too much', 'Other']).map((value) => <Choice key={value} label={value} selected={form.dealbreaker === value} onClick={() => update({ dealbreaker: value, dealbreakerOther: value === 'Other' ? form.dealbreakerOther : null })} testId={`choice-dealbreaker-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
      {form.dealbreaker === 'Other' && <div className="field"><label htmlFor="other-dealbreaker">Tell us a little more</label><input id="other-dealbreaker" value={form.dealbreakerOther ?? ''} onChange={(event) => update({ dealbreakerOther: event.target.value || null })} placeholder="Optional" data-testid="input-dealbreaker-other" /></div>}
    </QuestionFrame>
  );

  if (step === 9) return (
    <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="Actual intent" title="Would you actually try it?" subtitle={form.role === 'driver' ? 'If we found a Sage Creek student whose route and schedule genuinely fit yours, would you try taking them for a month?' : 'If we found a Sage Creek student driver whose route and schedule genuinely fit yours, would you try riding with them for a month?'} canContinue={canContinue} onBack={goBack} onContinue={next}>
      <div className="choice-grid">
        {['Definitely', 'Probably', 'Maybe', 'Probably not', 'No'].map((value) => <Choice key={value} label={value} selected={form.intentLevel === value} onClick={() => update({ intentLevel: value })} testId={`choice-intent-${value.replace(/\W/g, '-').toLowerCase()}`} />)}
      </div>
    </QuestionFrame>
  );

  return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker={roleLabel} title="Want us to reach out if your commute matches?" subtitle="If we find compatible Sage Creek commuters around your schedule, we’ll let you know." canContinue={canContinue} onBack={goBack} onContinue={next} continueLabel="Join the Sage Creek list" pending={createResponse.isPending}>
    <ContactFields form={form} update={update} />
    {createResponse.isError && <p className="field-error submit-error">We could not save that just now. Check your connection and try again.</p>}
  </QuestionFrame>;
}

function SuccessPage({ response, onBackHome }: { response: ResponseInput; onBackHome: () => void }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const shareData = { title: 'Sage Creek Commute', text: 'A more practical way to get from Sage Creek to U of M.', url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard?.writeText(window.location.href); setCopied(true); }
    } catch {
      // A cancelled native share is not an error state for the experience.
    }
  };
  return (
    <div className="question-shell">
      <div className="question-top"><div className="question-nav-row"><Link href="/" className="question-brand" data-testid="link-success-brand"><Brand /></Link><span className="eyebrow">All set</span></div><div className="progress-track"><div className="progress-fill" style={{ width: '100%' }} /></div></div>
      <main className="question-main success-main">
        <div className="success-mark"><CheckCircle2 size={34} /></div>
        <div className="eyebrow">Thanks for making the route clearer</div>
         <h1 className="question-title mt-5">You’re on the<br /><em>Sage Creek list.</em></h1>
         <p className="question-subtitle">We’re comparing real Sage Creek commute schedules to see where drivers and riders actually line up. If your commute has compatible matches, we’ll reach out.</p>
         <div className="success-summary">
           <div className="eyebrow">Your commute</div>
           {response.schedule.filter((day) => day.active).map((day) => <div className="summary-line" key={day.day}><span>{day.day.slice(0, 3)}</span><strong>{day.arrival}</strong><span>→</span><strong>{day.departure}</strong></div>)}
         </div>
         <p className="share-prompt">Know another U of M student in Sage Creek?</p>
        <div className="success-actions">
           <button className="btn-primary" onClick={share} data-testid="button-share-commute">{copied ? 'Link copied' : 'Share with a Sage Creek commuter'} {copied ? <Check size={16} /> : <Clipboard size={16} />}</button>
           <Link href="/" onClick={onBackHome} className="btn-quiet" data-testid="link-success-home">Back to Sage Creek Commute</Link>
        </div>
      </main>
    </div>
  );
}

function RoleSelectionScreen({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="question-shell">
      <div className="question-top">
        <div className="question-nav-row">
          <Link href="/" className="question-brand" data-testid="link-role-gate-brand"><Brand /></Link>
          <span className="eyebrow">Start here</span>
        </div>
      </div>
      <main className="question-main role-selection-main">
        <div className="eyebrow">Your commute</div>
        <h1 className="question-title mt-5">How do you usually get to U of M?</h1>
        <p className="question-subtitle">Choose one option so we can ask the right questions for your commute.</p>
        <RoleChoiceButtons onSelect={onSelect} testPrefix="role-gate" />
      </main>
    </div>
  );
}

function QuestionnaireEntry() {
  const [role, setRole] = useState<Role | null>(null);
  const [submitted, setSubmitted] = useState<ResponseInput | null>(null);
  const createEvent = useCreateEvent();
  const selectRole = (nextRole: Role) => {
    trackEvent(
      createEvent.mutate,
      nextRole === 'driver' ? EventInputEventName.driver_role_selected : EventInputEventName.rider_role_selected,
      nextRole,
    );
    setRole(nextRole);
  };
  const backHome = () => {
    setSubmitted(null);
    setRole(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  if (submitted) return <SuccessPage response={submitted} onBackHome={backHome} />;
  if (!role) return <RoleSelectionScreen onSelect={selectRole} />;
  return <Questionnaire initialRole={role} onComplete={setSubmitted} onExit={() => setRole(null)} />;
}

function Distribution({ title, items, note }: { title: string; items?: Array<{ label: string; count: number }>; note?: string }) {
  const safeItems = items ?? [];
  const max = Math.max(...safeItems.map((item) => item.count), 1);
  return <div className="admin-card"><h3>{title}</h3>{note && <p className="distribution-note">{note}</p>}{safeItems.length ? safeItems.map((item) => <div className="bar-row" key={item.label} data-testid={`distribution-${title.replace(/\W/g, '-').toLowerCase()}-${item.label.replace(/\W/g, '-').toLowerCase()}`}><span>{item.label}</span><div className="bar"><span style={{ width: `${(item.count / max) * 100}%` }} /></div><strong>{item.count}</strong></div>) : <p className="empty-admin">No responses yet.</p>}</div>;
}

function AdminLogin({ password, setPassword, onUnlock, error }: { password: string; setPassword: (value: string) => void; onUnlock: () => void; error?: boolean }) {
  return <main className="admin-login"><div className="admin-login-card"><div className="admin-lock"><LockKeyhole size={21} /></div><div className="eyebrow">Private workspace</div><h1 className="display-lg mt-4">Results, without<br /><em>the noise.</em></h1><p className="body-copy">Enter the admin password to view grouped validation signals and raw response data.</p><form onSubmit={(event) => { event.preventDefault(); onUnlock(); }} className="admin-login-form"><label htmlFor="admin-password">Admin password</label><input className="sr-only" type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" /><div className="password-input"><KeyRound size={16} /><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" autoComplete="current-password" data-testid="input-admin-password" /></div>{error && <p className="field-error">That password did not work. Try again.</p>}<button className="btn-primary w-full mt-4" type="submit" data-testid="button-admin-unlock">Unlock dashboard <ArrowRight size={16} /></button></form><Link href="/" className="admin-back-link" data-testid="link-admin-back"><ArrowLeft size={14} /> Back to public page</Link></div></main>;
}

function ResponseField({ label, value }: { label: string; value: string }) {
  return <div className="response-field"><span>{label}</span><strong>{value}</strong></div>;
}

function ResponseDetails({ response }: { response: AdminResponse }) {
  const activeDays = response.schedule.filter((day) => day.active);
  const utmValues = [response.utmSource, response.utmMedium, response.utmCampaign].filter(Boolean).join(' / ');
  return (
    <details className="response-detail" data-testid={`row-response-${response.id}`}>
      <summary className="response-summary">
        <div className="response-summary-main">
          <span className={`role-pill ${response.role}`}>{response.role}</span>
          <span>{new Date(response.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="response-summary-contact">{response.email ?? response.phone ?? 'No contact'} </div>
        <div className="response-summary-intent">{response.intentLevel}</div>
        <span className="response-expand">View answers <ChevronRight size={16} /></span>
      </summary>
      <div className="response-detail-body">
        <div className="response-detail-grid">
          <ResponseField label="Lives in Sage Creek" value={response.livesInSageCreek ? 'Yes' : 'No'} />
          <ResponseField label="U of M student" value={response.isUofMStudent ? 'Yes' : 'No'} />
          <ResponseField label="Ride direction" value={response.rideDirection} />
          <ResponseField label="Arrival flexibility" value={response.arrivalFlexibility} />
          <ResponseField label="Leave flexibility" value={response.departureFlexibility} />
          <ResponseField label="Schedule reliability" value={response.scheduleChangeFrequency} />
          <ResponseField label="Dealbreaker" value={response.dealbreaker} />
          {response.dealbreakerOther && <ResponseField label="Dealbreaker details" value={response.dealbreakerOther} />}
          <ResponseField label="Intent" value={response.intentLevel} />
          {response.email && <ResponseField label="Email" value={response.email} />}
          {response.phone && <ResponseField label="Phone" value={response.phone} />}
          <ResponseField label="Prefers text" value={response.prefersText ? 'Yes' : 'No'} />
          {utmValues && <ResponseField label="Source / UTM" value={utmValues} />}
          {response.referrer && <ResponseField label="Referrer" value={response.referrer} />}
          {response.role === 'driver' && response.maxDetour && <ResponseField label="Maximum detour" value={response.maxDetour} />}
          {response.role === 'driver' && response.seats && <ResponseField label="Students they would take" value={response.seats} />}
          {response.role === 'driver' && response.minimumMonthlyCompensation && <ResponseField label="Minimum monthly compensation" value={response.minimumMonthlyCompensation} />}
          {response.role === 'rider' && response.maxPickupWalk && <ResponseField label="Maximum pickup walk" value={response.maxPickupWalk} />}
          {response.role === 'rider' && response.currentTransportMethod && <ResponseField label="Current transportation" value={response.currentTransportMethod} />}
          {response.role === 'rider' && response.currentCommuteDuration && <ResponseField label="Usual commute duration" value={response.currentCommuteDuration} />}
          {response.role === 'rider' && response.maximumMonthlyWillingnessToPay && <ResponseField label="Maximum monthly willingness to pay" value={response.maximumMonthlyWillingnessToPay} />}
        </div>
        <div className="response-schedule">
          <div className="eyebrow">Active commute days</div>
          {activeDays.length ? activeDays.map((day) => <div className="response-schedule-day" key={day.day}><strong>{day.day.slice(0, 3).toUpperCase()}</strong><span>{day.arrival} → {day.departure}</span></div>) : <p className="empty-admin">No active commute days.</p>}
        </div>
      </div>
    </details>
  );
}

function AdminDashboard({ password }: { password: string }) {
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [weekdayFilter, setWeekdayFilter] = useState('all');
  const [arrivalFilter, setArrivalFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [dealbreakerFilter, setDealbreakerFilter] = useState('all');
  const [reliabilityFilter, setReliabilityFilter] = useState('all');
  const request = useMemo(() => ({ headers: { 'X-Admin-Password': password } }), [password]);
  const summaryQuery = useGetAdminSummary({ query: { enabled: Boolean(password), queryKey: getGetAdminSummaryQueryKey() }, request });
  const responsesQuery = useGetAdminResponses({ query: { enabled: Boolean(password), queryKey: getGetAdminResponsesQueryKey() }, request });
  const exportQuery = useExportAdminResponses({ query: { enabled: false, queryKey: ['/api/admin/export.csv'] }, request });
  const healthQuery = useHealthCheck({ query: { queryKey: ['/api/healthz'] } });
  const summary = summaryQuery.data as AdminSummary | undefined;
  const responses = (responsesQuery.data ?? []) as AdminResponse[];
  const filtered = useMemo(() => responses.filter((response) => {
    const matchesRole = roleFilter === 'all' || response.role === roleFilter;
    const haystack = `${response.email ?? ''} ${response.phone ?? ''} ${response.currentTransportMethod ?? ''} ${response.dealbreaker} ${response.dealbreakerOther ?? ''}`.toLowerCase();
    const matchesWeekday = weekdayFilter === 'all' || response.schedule.some((day) => day.day === weekdayFilter && day.active);
    const matchesArrival = arrivalFilter === 'all' || response.schedule.some((day) => day.active && day.arrival === arrivalFilter);
    const price = response.role === 'driver' ? response.minimumMonthlyCompensation : response.maximumMonthlyWillingnessToPay;
    const matchesIntent = intentFilter === 'all' || response.intentLevel === intentFilter;
    const matchesPrice = priceFilter === 'all' || price === priceFilter;
    const matchesDealbreaker = dealbreakerFilter === 'all' || response.dealbreaker === dealbreakerFilter;
    const matchesReliability = reliabilityFilter === 'all' || response.scheduleChangeFrequency === reliabilityFilter;
    return matchesRole && matchesWeekday && matchesArrival && matchesIntent && matchesPrice && matchesDealbreaker && matchesReliability && haystack.includes(filter.toLowerCase());
  }), [responses, filter, roleFilter, weekdayFilter, arrivalFilter, intentFilter, priceFilter, dealbreakerFilter, reliabilityFilter]);

  const download = async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'sage-creek-responses.csv'; anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  if (summaryQuery.isLoading || responsesQuery.isLoading) return <AdminLoading />;
  if (summaryQuery.isError || responsesQuery.isError) return <AdminError onRetry={() => { void summaryQuery.refetch(); void responsesQuery.refetch(); }} />;

  const total = summary?.total ?? responses.length;
  return <main className="admin-wrap"><div className="container-wide">
    <div className="admin-header"><div><Link href="/" className="question-brand" data-testid="link-admin-dashboard-brand"><Brand /></Link><div className="eyebrow mt-10">Private results dashboard</div><h1 className="display-lg mt-3">The shape of<br /><em>the commute.</em></h1></div><div className="admin-header-actions"><span className="health-pill"><span className={`health-dot ${healthQuery.data?.status === 'ok' ? 'live' : ''}`} /> API {healthQuery.data?.status ?? 'checking'}</span><button onClick={download} className="btn-quiet" disabled={exportQuery.isFetching} data-testid="button-export-csv"><Download size={16} /> {exportQuery.isFetching ? 'Preparing…' : 'Export CSV'}</button></div></div>
     <div className="admin-stat-grid"><AdminStat value={total} label="total responses" /><AdminStat value={summary?.drivers ?? 0} label="drivers (unique)" accent /><AdminStat value={summary?.riders ?? 0} label="riders (unique)" /><AdminStat value={(summary?.interestedDrivers ?? 0) + (summary?.interestedRiders ?? 0)} label="definitely / probably (unique)" accent /></div>
     <div className="section-rule mt-12 pt-8"><div className="section-heading"><div><div className="eyebrow">Grouped signals</div><h2>What students are telling us</h2><p className="section-note">Person-level cards count unique completed response IDs. Schedule cards count commute days, not unique students.</p></div><span className="data-note">Updates on refresh</span></div></div>
      <div className="admin-grid mt-5"><Distribution title="Compensation · drivers" items={summary?.driverCompensation} /><Distribution title="Willingness to pay · riders" items={summary?.riderWillingness} /><Distribution title="Active commute days by weekday" items={summary?.weekdayActivity} note="Counts commute days, not unique students." /><Distribution title="Scheduled arrivals" items={summary?.arrivalDistribution} note="Counts commute days, not unique students." /><Distribution title="Current transport" items={summary?.transportMethods} /><Distribution title="Current commute duration" items={summary?.commuteDurations} /><Distribution title="Schedule reliability" items={summary?.reliability} /><Distribution title="Dealbreakers · all roles" items={[...(summary?.driverDealbreakers ?? []), ...(summary?.riderDealbreakers ?? [])]} /></div>
    <div className="admin-card mt-5"><div className="section-heading"><div><div className="eyebrow">Potential overlap</div><h3 className="mt-2">Where driver and rider schedules may line up</h3></div><span className="data-note">day / arrival window</span></div><div className="overlap-grid mt-5">{(summary?.potentialOverlap ?? []).length ? summary?.potentialOverlap.map((bucket) => <div className="overlap-cell" key={`${bucket.day}-${bucket.time}`}><span>{bucket.day.slice(0, 3)}</span><strong>{bucket.time}</strong><small><b>{bucket.drivers}</b> drivers · <b>{bucket.riders}</b> riders</small></div>) : <p className="empty-admin">Overlap buckets will appear after the first responses.</p>}</div></div>
      <div className="section-rule mt-12 pt-8"><div className="section-heading"><div><div className="eyebrow">Raw responses</div><h2>Every answer, searchable</h2></div><span className="data-note">{filtered.length} shown</span></div><div className="response-filters mt-5"><input className="admin-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search contact, transport, objection…" data-testid="input-response-filter" /><select className="admin-input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | Role)} data-testid="select-response-role"><option value="all">All roles</option><option value="driver">Drivers</option><option value="rider">Riders</option></select><select className="admin-input" value={weekdayFilter} onChange={(event) => setWeekdayFilter(event.target.value)} data-testid="select-response-weekday"><option value="all">Any weekday</option>{days.map((day) => <option value={day.key} key={day.key}>{day.label}</option>)}</select><select className="admin-input" value={arrivalFilter} onChange={(event) => setArrivalFilter(event.target.value)} data-testid="select-response-arrival"><option value="all">Any arrival</option>{arrivalChoices.map((time) => <option value={time} key={time}>{time}</option>)}</select><select className="admin-input" value={intentFilter} onChange={(event) => setIntentFilter(event.target.value)} data-testid="select-response-intent"><option value="all">Any intent</option>{['Definitely', 'Probably', 'Maybe', 'Probably not', 'No'].map((value) => <option value={value} key={value}>{value}</option>)}</select><select className="admin-input" value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)} data-testid="select-response-price"><option value="all">Any price bucket</option>{[...(summary?.driverCompensation ?? []), ...(summary?.riderWillingness ?? [])].map((item, index) => <option value={item.label} key={`${item.label}-${index}`}>{item.label}</option>)}</select><select className="admin-input" value={dealbreakerFilter} onChange={(event) => setDealbreakerFilter(event.target.value)} data-testid="select-response-dealbreaker"><option value="all">Any dealbreaker</option>{[...(summary?.driverDealbreakers ?? []), ...(summary?.riderDealbreakers ?? [])].map((item, index) => <option value={item.label} key={`${item.label}-${index}`}>{item.label}</option>)}</select><select className="admin-input" value={reliabilityFilter} onChange={(event) => setReliabilityFilter(event.target.value)} data-testid="select-response-reliability"><option value="all">Any reliability</option>{['Almost never', 'Maybe once a month', 'A few times a month', 'About once a week', 'Multiple times a week'].map((value) => <option value={value} key={value}>{value}</option>)}</select></div></div>
     <div className="response-list mt-5">{filtered.map((response) => <ResponseDetails key={response.id} response={response} />)}{!filtered.length && <div className="empty-table">No responses match this filter.</div>}</div>
  </div></main>;
}

function AdminStat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return <div className={`admin-stat ${accent ? 'accent' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function AdminLoading() {
  return <main className="admin-wrap"><div className="container-wide"><div className="skeleton-brand" /><div className="skeleton-line wide mt-14" /><div className="skeleton-line medium mt-4" /><div className="admin-stat-grid mt-12">{[1, 2, 3, 4].map((item) => <div className="skeleton-box" key={item} />)}</div><div className="admin-grid mt-8">{[1, 2, 3, 4].map((item) => <div className="skeleton-box tall" key={item} />)}</div></div></main>;
}

function AdminError({ onRetry }: { onRetry: () => void }) {
  return <main className="admin-login"><div className="admin-login-card"><div className="admin-lock error"><RefreshCw size={21} /></div><div className="eyebrow">Could not load results</div><h1 className="display-lg mt-4">The dashboard<br /><em>needs a retry.</em></h1><p className="body-copy">Check the admin server and password, then try the request again.</p><button className="btn-primary w-full mt-5" onClick={onRetry} data-testid="button-admin-retry">Try again <RefreshCw size={16} /></button><Link href="/" className="admin-back-link" data-testid="link-admin-error-back"><ArrowLeft size={14} /> Back to public page</Link></div></main>;
}

function AdminPage() {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [attempted, setAttempted] = useState(false);
  return unlocked ? <AdminDashboard password={password} /> : <AdminLogin password={password} setPassword={setPassword} onUnlock={() => { setAttempted(true); setUnlocked(Boolean(password.trim())); }} error={attempted && !password.trim()} />;
}

function Home() {
  const [started, setStarted] = useState<Role | null>(null);
  const [submitted, setSubmitted] = useState<ResponseInput | null>(null);
  const backHome = () => {
    setSubmitted(null);
    setStarted(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  if (submitted) return <SuccessPage response={submitted} onBackHome={backHome} />;
  if (started) return <Questionnaire initialRole={started} onComplete={(response) => setSubmitted(response)} onExit={() => setStarted(null)} />;
  return <LandingPage onStart={(role) => setStarted(role)} />;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/questionnaire" component={QuestionnaireEntry} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;