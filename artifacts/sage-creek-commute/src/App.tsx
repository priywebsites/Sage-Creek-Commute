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
  type PosterSource,
  type AttributionSummary,
  type AdminResponse,
  type PosterRegistryItem,
  type AdminSummary,
  type ResponseInput,
  useCreateEvent,
  useCreateResponse,
  useExportAdminResponses,
  useGetAdminResponses,
  useGetAdminSummary,
  useHealthCheck,
  useUpdateAdminPoster,
  getGetAdminResponsesQueryKey,
  getGetAdminSummaryQueryKey,
  getExportAdminResponsesQueryKey,
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
type Direction = 'to_campus' | 'from_campus';
const qrPosterSources = new Set<PosterSource>(['P01', 'P02', 'P03']);
const posterAttributionKey = 'sage_creek_commute_poster_source';
const anonymousVisitorKey = 'sage_creek_commute_anonymous_visitor';
const browserSessionKey = 'sage_creek_commute_browser_session';
const selectedRoleKey = 'sage_creek_commute_selected_role_v2';
const surveyDraftKey = 'sage_creek_commute_survey_draft_v2';
const canonicalSurveyUrl = typeof window === 'undefined'
  ? '/questionnaire'
  : new URL('/questionnaire', window.location.origin).toString();

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

const blankSchedule: ResponseInput['schedule'] = days.map(({ key }) => ({
  day: key,
  active: false,
  arrival: 'Varies',
  departure: 'Varies',
  directions: [],
}));

const initialResponseFields: Omit<ResponseInput, 'role'> = {
  surveyVersion: 'v2',
  posterSource: 'direct_unknown',
  submissionId: '',
  livesInSageCreek: true,
  livesOutsideSageCreek: false,
  neighborhood: null,
  studentStatus: 'fort_garry',
  isUofMStudent: true,
  schedule: blankSchedule,
  weeklyTripCount: 0,
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
  driverRateCents: null,
  driverRateSelection: null,
  riderPriceCents: null,
  riderPriceSelection: null,
  scheduleChangeFrequency: 'A few times a month',
  dealbreaker: '',
  dealbreakerOther: null,
  finalConcern: null,
  finalConcernOther: null,
  intentLevel: '',
  firstName: null,
  email: null,
  phone: null,
  contactMethod: 'none',
  contactPermission: false,
  prefersText: false,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrer: typeof document !== 'undefined' ? document.referrer || null : null,
};

function readStoredRole(): Role | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(selectedRoleKey);
  return value === 'driver' || value === 'rider' ? value : null;
}

function readStoredDraft(role: Role): { step: number; form: ResponseInput } | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(surveyDraftKey) ?? 'null');
    return parsed?.role === role && parsed?.form
      ? { step: Math.min(Math.max(Number(parsed.step) || 0, 0), 9), form: parsed.form as ResponseInput }
      : null;
  } catch {
    return null;
  }
}

function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getAttributionContext(): {
  posterSource: PosterSource;
  anonymousVisitorId: string;
  browserSessionId: string;
} {
  if (typeof window === 'undefined') {
    return {
      posterSource: 'direct_unknown',
      anonymousVisitorId: 'server-rendered',
      browserSessionId: 'server-rendered',
    };
  }
  const explicitSource = new URLSearchParams(window.location.search).get('source');
  const storedSource = window.localStorage.getItem(posterAttributionKey);
  const explicitPosterSource = qrPosterSources.has(explicitSource as PosterSource)
    ? explicitSource as PosterSource
    : null;
  const posterSource = explicitPosterSource
    ?? (qrPosterSources.has(storedSource as PosterSource) ? storedSource as PosterSource : 'direct_unknown');
  if (explicitPosterSource) {
    window.localStorage.setItem(posterAttributionKey, explicitPosterSource);
  }
  let anonymousVisitorId = window.localStorage.getItem(anonymousVisitorKey);
  if (!anonymousVisitorId) {
    anonymousVisitorId = createClientId('visitor');
    window.localStorage.setItem(anonymousVisitorKey, anonymousVisitorId);
  }
  let browserSessionId = window.sessionStorage.getItem(browserSessionKey);
  if (!browserSessionId) {
    browserSessionId = createClientId('session');
    window.sessionStorage.setItem(browserSessionKey, browserSessionId);
  }
  return { posterSource, anonymousVisitorId, browserSessionId };
}

function trackEvent(
  mutate: ReturnType<typeof useCreateEvent>['mutate'],
  eventName: EventInputEventName,
  role?: Role,
  step?: number,
) {
  mutate({
    data: {
      eventName,
      role: role ?? null,
      step: step ?? null,
      ...getAttributionContext(),
    },
  }, { onError: () => undefined });
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

function LegacyLandingPage({ onStart }: { onStart: (role: Role) => void }) {
  const createEvent = useCreateEvent();
  useEffect(() => {
    trackEvent(createEvent.mutate, EventInputEventName.landing_viewed);
  }, [createEvent.mutate]);
  const selectRole = (role: Role) => {
    trackEvent(
      createEvent.mutate,
      role === 'driver' ? EventInputEventName.driver_role_selected : EventInputEventName.rider_role_selected,
      role,
    );
    trackEvent(createEvent.mutate, EventInputEventName.survey_started, role);
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
      <button onClick={() => onSelect('driver')} className="btn-primary role-choice-button" data-testid={`button-${testPrefix}-driver`}>
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
    <article className="feature-item how-step-card">
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
          <span className="step-count font-mono-custom">{String(step + 1).padStart(2, '0')} <span>/ {String(total).padStart(2, '0')}</span></span>
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

function LegacyQuestionnaire({ initialRole, onComplete, onExit }: { initialRole: Role; onComplete: (response: ResponseInput) => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ResponseInput>(() => ({
    ...initialResponseFields,
    role: initialRole,
    posterSource: getAttributionContext().posterSource,
    submissionId: createClientId('submission'),
  }));
  const [exitKind, setExitKind] = useState<ExitKind>(null);
  const submitGuard = useRef(false);
  const createResponse = useCreateResponse();
  const createEvent = useCreateEvent();
  const total = 11;
  const update = (patch: Partial<ResponseInput>) => setForm((previous) => ({ ...previous, ...patch }));

  const reset = () => {
    setForm({
      ...initialResponseFields,
      role: initialRole,
      posterSource: getAttributionContext().posterSource,
      submissionId: createClientId('submission'),
      schedule: blankSchedule.map((entry) => ({ ...entry })),
    });
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
      const payload: ResponseInput = {
        ...form,
         posterSource: getAttributionContext().posterSource,
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

function MatchIllustration() {
  return (
    <div className="match-illustration" aria-label="Example match">
      <div className="match-illustration-label">Example match</div>
      <div className="match-stage">
        <div className="match-card driver">
          <span className="match-card-role">Driver</span>
          <strong>Mon / Wed / Fri</strong>
          <span>Arrives 8:30 AM</span>
        </div>
        <svg className="match-connector" viewBox="0 0 180 100" aria-hidden="true">
          <path d="M8 50 C48 12, 132 88, 172 50" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" />
          <circle cx="90" cy="50" r="5" fill="currentColor" />
        </svg>
        <div className="match-card rider">
          <span className="match-card-role">Rider</span>
          <strong>Mon / Wed / Fri</strong>
          <span>Needs to arrive by 8:45 AM</span>
        </div>
      </div>
      <p className="match-caption">Similar times. A nearby pickup spot.</p>
    </div>
  );
}

function HowItWouldWork() {
  const [role, setRole] = useState<Role>('rider');
  const copy = role === 'rider'
    ? [
      ['01', 'Tell us when you need rides', 'Choose your campus days, arrival times and when you’re ready to head home.'],
      ['02', 'Find someone going your way', 'We’d look for a nearby student driving at times that work for you.'],
      ['03', 'Set up your regular rides', 'Agree on the days and pickup spot. The plan is a monthly subscription for your arranged rides.'],
    ]
    : [
      ['01', 'Add the trips you already make', 'Tell us when you drive to campus and home, and how many seats you can offer.'],
      ['02', 'Find riders who fit your trip', 'We’d look for nearby students whose times work with yours.'],
      ['03', 'Earn money for giving rides', 'Agree on the trips and pickup spot. You’d get paid for rides you complete.'],
    ];
  return (
    <section id="how-it-works" className="how-section">
      <div className="container-wide">
        <div className="how-header">
          <div>
            <div className="eyebrow">The idea</div>
            <h2 className="display-lg mt-4">How it would work</h2>
          </div>
          <div className="how-toggle" role="group" aria-label="Choose an explanation">
            {(['rider', 'driver'] as Role[]).map((option) => (
              <button key={option} type="button" className={role === option ? 'active' : ''} onClick={() => setRole(option)} data-testid={`button-how-${option}`}>
                {option === 'rider' ? 'Riders' : 'Drivers'}
              </button>
            ))}
          </div>
        </div>
        <div className="how-steps">
          {copy.map(([number, title, body]) => <Feature key={number} number={number} title={title} body={body} />)}
        </div>
        <p className="how-note">Right now, we’re checking interest, schedules and pricing. If you leave your email, we can contact you about a possible match. Completing the survey does not reserve a ride.</p>
      </div>
    </section>
  );
}

function LandingPage({ onStart }: { onStart: (role: Role) => void }) {
  const createEvent = useCreateEvent();
  useEffect(() => {
    trackEvent(createEvent.mutate, EventInputEventName.landing_viewed);
  }, [createEvent.mutate]);
  const selectRole = (role: Role) => {
    trackEvent(createEvent.mutate, role === 'driver' ? EventInputEventName.driver_role_selected : EventInputEventName.rider_role_selected, role);
    trackEvent(createEvent.mutate, EventInputEventName.survey_started, role);
    onStart(role);
  };
  return (
    <main className="site-shell">
      <PublicHeader />
      <section className="hero-section redesigned-hero">
        <div className="container-wide hero-grid">
          <div className="hero-copy">
            <div className="eyebrow fade-up">Sage Creek ↔ U of M</div>
            <h1 className="display-xl fade-up delay-1">Same campus.<br /><em>Better commute.</em></h1>
            <p className="hero-lede fade-up delay-2">Drive to U of M? Earn money taking another student on trips you already make. Need rides? Find someone nearby who travels at times that work for you.</p>
            <p className="stage-clarification fade-up delay-2">We’re collecting schedules to see who we could match. No payment or commitment.</p>
            <div className="hero-actions fade-up delay-3">
              <RoleChoiceButtons onSelect={selectRole} testPrefix="hero" />
            </div>
          </div>
          <MatchIllustration />
        </div>
      </section>
      <HowItWouldWork />
      <section className="role-cta-section redesigned-cta">
        <div className="container-wide role-cta-card">
          <div>
            <div className="eyebrow">Help us check the route</div>
            <h2>Could your commute line up?</h2>
            <p>Choose the option that describes you. The survey takes a few short screens.</p>
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

function scheduleDirections(entry: ResponseInput['schedule'][number]): Direction[] {
  return entry.directions ?? [];
}

function weeklyTripCount(schedule: ResponseInput['schedule']): number {
  return schedule.reduce((total, entry) => total + scheduleDirections(entry).length, 0);
}

function ScheduleDirectionEditor({ schedule, onChange }: { schedule: ResponseInput['schedule']; onChange: (schedule: ResponseInput['schedule']) => void }) {
  const toggleDirection = (day: DayName, direction: Direction) => {
    onChange(schedule.map((entry) => {
      if (entry.day !== day) return entry;
      const current = scheduleDirections(entry);
      const directions = current.includes(direction) ? current.filter((item) => item !== direction) : [...current, direction];
      return {
        ...entry,
        active: directions.length > 0,
        directions,
        arrival: directions.includes('to_campus') ? (entry.arrival === 'Varies' ? '8:30 AM' : entry.arrival) : 'Varies',
        departure: directions.includes('from_campus') ? (entry.departure === 'Varies' ? '4:30 PM' : entry.departure) : 'Varies',
      };
    }));
  };
  return (
    <div className="direction-list">
      {days.map(({ key, label }) => {
        const current = schedule.find((entry) => entry.day === key) ?? blankSchedule[0];
        const directions = scheduleDirections(current);
        return (
          <div className={`direction-day ${directions.length ? 'selected' : ''}`} key={key}>
            <div className="direction-day-heading"><strong>{label}</strong><span>{directions.length ? `${directions.length} direction${directions.length > 1 ? 's' : ''}` : 'Not this day'}</span></div>
            <div className="direction-options">
              {([['to_campus', 'To campus'], ['from_campus', 'Home from campus']] as [Direction, string][]).map(([direction, labelText]) => (
                <button type="button" key={direction} className={`direction-option ${directions.includes(direction) ? 'selected' : ''}`} onClick={() => toggleDirection(key, direction)} aria-pressed={directions.includes(direction)} data-testid={`choice-${key}-${direction}`}>
                  <span>{labelText}</span><span className="choice-check">{directions.includes(direction) && <Check size={14} strokeWidth={3} />}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleTimesEditor({ schedule, onChange }: { schedule: ResponseInput['schedule']; onChange: (schedule: ResponseInput['schedule']) => void }) {
  const updateTime = (day: DayName, field: 'arrival' | 'departure', value: string) => onChange(schedule.map((entry) => entry.day === day ? { ...entry, [field]: value } : entry));
  const copyToOtherDays = (sourceDay: DayName) => {
    const source = schedule.find((entry) => entry.day === sourceDay);
    if (!source) return;
    onChange(schedule.map((entry) => entry.day === sourceDay ? entry : {
      ...entry,
      active: source.active,
      directions: source.directions ? [...source.directions] : [],
      arrival: source.arrival,
      departure: source.departure,
    }));
  };
  return (
    <div className="time-list">
      {schedule.filter((entry) => entry.active && scheduleDirections(entry).length).map((entry) => {
        const directions = scheduleDirections(entry);
        const label = days.find((day) => day.key === entry.day)?.label ?? entry.day;
        return (
          <div className="time-day" key={entry.day}>
            <div className="time-day-heading"><strong>{label}</strong><button type="button" className="copy-times" onClick={() => copyToOtherDays(entry.day)}><Clipboard size={13} /> Copy to other days</button></div>
            <div className="time-fields">
              {directions.includes('to_campus') && <label>Usually arrive on campus at<select value={entry.arrival} onChange={(event) => updateTime(entry.day, 'arrival', event.target.value)} data-testid={`select-arrival-${entry.day}`}>{arrivalTimeOptions.map((time) => <option key={time}>{time}</option>)}</select></label>}
              {directions.includes('from_campus') && <label>Usually leave campus at<select value={entry.departure} onChange={(event) => updateTime(entry.day, 'departure', event.target.value)} data-testid={`select-departure-${entry.day}`}>{departureTimeOptions.map((time) => <option key={time}>{time}</option>)}</select></label>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const riderPriceOptions = [
  { label: '$20/month', value: 'preset_20', cents: 2000 },
  { label: '$40/month', value: 'preset_40', cents: 4000 },
  { label: '$60/month', value: 'preset_60', cents: 6000 },
  { label: '$80/month', value: 'preset_80', cents: 8000 },
  { label: '$100/month', value: 'preset_100', cents: 10000 },
  { label: 'Enter my own amount', value: 'custom', cents: null },
  { label: 'Not sure', value: 'not_sure', cents: null },
  { label: 'Only if free', value: 'free', cents: 0 },
];

const driverRateOptions = [
  { label: '$1 per passenger per trip', value: 'preset_1', cents: 100 },
  { label: '$2 per passenger per trip', value: 'preset_2', cents: 200 },
  { label: '$3 per passenger per trip', value: 'preset_3', cents: 300 },
  { label: '$4 per passenger per trip', value: 'preset_4', cents: 400 },
  { label: '$5 per passenger per trip', value: 'preset_5', cents: 500 },
  { label: 'Enter my own amount', value: 'custom', cents: null },
  { label: 'Not sure', value: 'not_sure', cents: null },
];

function contactFormValid(form: ResponseInput): boolean {
  if (form.contactMethod === 'none') return true;
  if (!form.firstName?.trim()) return false;
  const phoneValid = Boolean(form.phone && form.phone.replace(/\D/g, '').length >= 7);
  const emailValid = Boolean(form.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email));
  if (form.contactMethod === 'phone') return phoneValid;
  if (form.contactMethod === 'email') return emailValid;
  return phoneValid && emailValid;
}

function NewContactFields({ form, update }: { form: ResponseInput; update: (patch: Partial<ResponseInput>) => void }) {
  const methods: Array<{ value: NonNullable<ResponseInput['contactMethod']>; label: string }> = [
    { value: 'phone', label: 'Phone number' },
    { value: 'email', label: 'Email' },
    { value: 'both', label: 'Both' },
    { value: 'none', label: 'I don’t want to be contacted' },
  ];
  return (
    <div className="contact-fields">
      <div className="contact-note"><ShieldCheck size={16} /><span>You can leave a phone number, email, or both. We’ll only use your information for this commute project.</span></div>
      <div className="choice-grid contact-method-grid">
        {methods.map((method) => <Choice key={method.value} label={method.label} selected={form.contactMethod === method.value} onClick={() => update({ contactMethod: method.value, ...(method.value === 'none' ? { firstName: null, phone: null, email: null, contactPermission: false } : {}) })} testId={`choice-contact-${method.value}`} />)}
      </div>
      {form.contactMethod !== 'none' && <>
        <div className="field"><label htmlFor="first-name">First name</label><input id="first-name" value={form.firstName ?? ''} onChange={(event) => update({ firstName: event.target.value || null })} data-testid="input-first-name" /></div>
        {(form.contactMethod === 'phone' || form.contactMethod === 'both') && <div className="field"><label htmlFor="phone-v2">Phone number</label><input id="phone-v2" type="tel" value={form.phone ?? ''} onChange={(event) => update({ phone: event.target.value || null })} placeholder="204 555 0142" data-testid="input-phone" /></div>}
        {(form.contactMethod === 'email' || form.contactMethod === 'both') && <div className="field"><label htmlFor="email-v2">Email address</label><input id="email-v2" type="email" value={form.email ?? ''} onChange={(event) => update({ email: event.target.value || null })} placeholder="you@example.com" data-testid="input-email" /></div>}
        <label className="permission-check"><input type="checkbox" checked={form.contactPermission} onChange={(event) => update({ contactPermission: event.target.checked })} /> <span>You can contact me about a possible commute match.</span></label>
      </>}
      {!contactFormValid(form) && <p className="field-error">Add the requested name and contact details to continue.</p>}
    </div>
  );
}

function Questionnaire({ initialRole, onComplete, onExit }: { initialRole: Role; onComplete: (response: ResponseInput) => void; onExit: () => void }) {
  const storedDraft = useMemo(() => readStoredDraft(initialRole), [initialRole]);
  const [step, setStep] = useState(() => storedDraft?.step ?? 0);
  const [form, setForm] = useState<ResponseInput>(() => storedDraft?.form ?? ({
    ...initialResponseFields,
    role: initialRole,
    posterSource: getAttributionContext().posterSource,
    submissionId: createClientId('submission'),
    schedule: blankSchedule.map((entry) => ({ ...entry, directions: [] })),
  }));
  const [exitKind, setExitKind] = useState<ExitKind>(null);
  const submitGuard = useRef(false);
  const createResponse = useCreateResponse();
  const createEvent = useCreateEvent();
  const total = 10;
  const update = (patch: Partial<ResponseInput>) => setForm((previous) => ({ ...previous, ...patch }));
  useEffect(() => {
    if (typeof window === 'undefined' || exitKind) return;
    window.localStorage.setItem(selectedRoleKey, initialRole);
    window.localStorage.setItem(surveyDraftKey, JSON.stringify({ flowVersion: 'v2-10', role: initialRole, step, form }));
  }, [exitKind, form, initialRole, step]);
  const reset = () => {
    window.localStorage.removeItem(surveyDraftKey);
    setForm({
      ...initialResponseFields,
      role: initialRole,
      posterSource: getAttributionContext().posterSource,
      submissionId: createClientId('submission'),
      schedule: blankSchedule.map((entry) => ({ ...entry, directions: [] })),
    });
    setStep(0);
    setExitKind(null);
    submitGuard.current = false;
  };
  const scheduleReady = form.schedule.some((entry) => entry.active && scheduleDirections(entry).length);
  const timesReady = form.schedule.filter((entry) => entry.active).every((entry) => {
    const directions = scheduleDirections(entry);
    return directions.length > 0 &&
      (!directions.includes('to_campus') || entry.arrival !== 'Varies') &&
      (!directions.includes('from_campus') || entry.departure !== 'Varies');
  });
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(form.studentStatus);
    if (step === 1) return Boolean(form.neighborhood?.trim());
    if (step === 2) return scheduleReady;
    if (step === 3) return timesReady;
    if (step === 4) return Boolean(form.scheduleChangeFrequency);
    if (step === 5) return Boolean(form.arrivalFlexibility) && (form.role === 'rider' || Boolean(form.maxDetour));
    if (step === 6) return form.role === 'driver' ? Boolean(form.seats) : Boolean(form.maxPickupWalk);
    if (step === 7) {
      if (form.role === 'driver') return Boolean(form.driverRateSelection && (form.driverRateSelection !== 'custom' || form.driverRateCents !== null));
      return Boolean(form.riderPriceSelection && (form.riderPriceSelection !== 'custom' || form.riderPriceCents !== null));
    }
    if (step === 8) return Boolean(form.finalConcern && (form.finalConcern !== 'Something else' || form.finalConcernOther?.trim()));
    if (step === 9) return contactFormValid(form);
    return true;
  }, [form, scheduleReady, step, timesReady]);
  const next = () => {
    if (!canContinue) return;
    if (step === 0 && form.studentStatus === 'other') { setExitKind('student'); return; }
    if (step === total - 1) {
      if (submitGuard.current || createResponse.isPending) return;
      submitGuard.current = true;
      const payload: ResponseInput = {
        ...form,
        isUofMStudent: form.studentStatus !== 'other',
        livesInSageCreek: !form.livesOutsideSageCreek,
        weeklyTripCount: weeklyTripCount(form.schedule),
        dealbreaker: form.finalConcern ?? 'Not specified',
        dealbreakerOther: form.finalConcernOther,
        minimumMonthlyCompensation: form.role === 'driver' && form.driverRateSelection ? (driverRateOptions.find((option) => option.value === form.driverRateSelection)?.label ?? 'Custom') : null,
        maximumMonthlyWillingnessToPay: form.role === 'rider' && form.riderPriceSelection ? (riderPriceOptions.find((option) => option.value === form.riderPriceSelection)?.label ?? 'Custom') : null,
        prefersText: form.contactMethod === 'phone' || form.contactMethod === 'both',
        intentLevel: 'Not asked in v2',
        posterSource: getAttributionContext().posterSource,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      };
      createResponse.mutate({ data: payload }, {
        onSuccess: () => {
          window.localStorage.removeItem(surveyDraftKey);
          window.localStorage.removeItem(selectedRoleKey);
          onComplete(payload);
        },
        onError: () => { submitGuard.current = false; },
      });
      trackEvent(createEvent.mutate, EventInputEventName.form_completed, form.role, total);
      return;
    }
    setStep((current) => current + 1);
    trackEvent(createEvent.mutate, EventInputEventName.step_reached, form.role, step + 2);
  };
  const goBack = () => {
    if (step === 0) { onExit(); return; }
    setStep((current) => current - 1);
  };
  const changeRole = () => {
    if (step > 0 && typeof window !== 'undefined' && !window.confirm('Changing your role will reset this questionnaire. Continue?')) return;
    onExit();
  };
  const frameRoleProps = { role: form.role, onChangeRole: changeRole };
  if (exitKind) return <QualificationExit kind={exitKind} onReset={reset} />;
  if (step === 0) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="1 · Campus check" title="Are you a U of M student?" subtitle="This is for students travelling to the Fort Garry campus." canContinue={canContinue} onBack={goBack} onContinue={next}>
    <div className="choice-grid">
      <Choice label="Yes, at Fort Garry" selected={form.studentStatus === 'fort_garry'} onClick={() => update({ studentStatus: 'fort_garry', isUofMStudent: true })} testId="choice-student-fort-garry" />
      <Choice label="Starting at Fort Garry this term" selected={form.studentStatus === 'starting_fort_garry'} onClick={() => update({ studentStatus: 'starting_fort_garry', isUofMStudent: true })} testId="choice-student-starting" />
      <Choice label="No / a different campus" selected={form.studentStatus === 'other'} onClick={() => update({ studentStatus: 'other', isUofMStudent: false })} testId="choice-student-other" />
    </div>
  </QuestionFrame>;
  if (step === 1) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="2 · Your area" title="Which part of Sage Creek are you near?" subtitle="A nearby street, park or shop is enough. We don’t need your home address." canContinue={canContinue} onBack={goBack} onContinue={next}>
    <div className="field neighborhood-field"><label htmlFor="neighborhood">{form.livesOutsideSageCreek ? 'Which neighbourhood are you near?' : 'Nearby street, park or shop'}</label><input id="neighborhood" value={form.neighborhood ?? ''} onChange={(event) => update({ neighborhood: event.target.value || null })} placeholder={form.livesOutsideSageCreek ? 'Your neighbourhood' : 'For example, Sage Creek Boulevard'} data-testid="input-neighborhood" /></div>
    <button type="button" className={`outside-choice ${form.livesOutsideSageCreek ? 'selected' : ''}`} onClick={() => update({ livesOutsideSageCreek: !form.livesOutsideSageCreek, livesInSageCreek: form.livesOutsideSageCreek })} aria-pressed={form.livesOutsideSageCreek} data-testid="choice-outside-sage-creek"><span>I live outside Sage Creek</span><span className="choice-check">{form.livesOutsideSageCreek && <Check size={14} />}</span></button>
  </QuestionFrame>;
  if (step === 2) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="3 · Your week" title={form.role === 'driver' ? 'Which days could you take passengers?' : 'Which days do you need rides?'} subtitle="For each day, choose to campus, home from campus, or both." canContinue={canContinue} onBack={goBack} onContinue={next}><ScheduleDirectionEditor schedule={form.schedule} onChange={(schedule) => update({ schedule, weeklyTripCount: weeklyTripCount(schedule) })} /></QuestionFrame>;
  if (step === 3) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="4 · Your times" title={form.role === 'driver' ? 'What times do you usually travel?' : 'What times do you need rides?'} subtitle={form.role === 'driver' ? 'Enter when you normally arrive on campus and when you leave to go home.' : 'Enter when you need to be on campus and the earliest you can leave to go home.'} canContinue={canContinue} onBack={goBack} onContinue={next}><ScheduleTimesEditor schedule={form.schedule} onChange={(schedule) => update({ schedule, weeklyTripCount: weeklyTripCount(schedule) })} /><p className="field-note">You can make every day different. Use “Copy to other days” only when it really fits.</p></QuestionFrame>;
  if (step === 4) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="5 · Weekly rhythm" title="Is your schedule usually the same each week?" subtitle="This helps us see whether regular weekly rides would work." canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{['Mostly the same', 'Alternates between weeks', 'Changes often'].map((value) => <Choice key={value} label={value} selected={form.scheduleChangeFrequency === value} onClick={() => update({ scheduleChangeFrequency: value })} testId={`choice-rhythm-${value.replace(/\W/g, '-').toLowerCase()}`} />)}</div></QuestionFrame>;
  if (step === 5) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="6 · Flexibility" title="How flexible are your travel times?" subtitle={form.role === 'driver' ? 'Could you move your usual trip a little earlier or later?' : 'Could you arrive earlier or leave later to get a ride?'} canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{['My times are fixed', 'Up to 15 minutes', 'Up to 30 minutes', 'Depends on the day'].map((value) => <Choice key={value} label={value} selected={form.arrivalFlexibility === value} onClick={() => update({ arrivalFlexibility: value, departureFlexibility: value })} testId={`choice-flex-${value.replace(/\W/g, '-').toLowerCase()}`} />)}</div>{form.role === 'driver' && <div className="inline-question"><div className="inline-question-title">How much extra driving would you consider for a pickup?</div><div className="choice-grid">{['No extra detour', 'Up to 5 minutes', 'Up to 10 minutes', 'Up to 15 minutes', 'More than 15 minutes'].map((value) => <Choice key={value} label={value} selected={form.maxDetour === value} onClick={() => update({ maxDetour: value })} testId={`choice-detour-${value.replace(/\W/g, '-').toLowerCase()}`} />)}</div></div>}<p className="field-note">These are general preferences, not automatic permission to change every trip.</p></QuestionFrame>;
  if (step === 6 && form.role === 'driver') return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="7 · Driver details" title="How many passengers could you take?" subtitle="Count the spare seats you’d normally be happy to offer." canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{['1', '2', '3', '4+'].map((value) => <Choice key={value} label={value} selected={form.seats === value} onClick={() => update({ seats: value })} testId={`choice-seats-${value}`} />)}</div></QuestionFrame>;
  if (step === 6) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="7 · Rider details" title="How far would you walk to meet your driver?" subtitle="You’d meet at an agreed nearby spot, which might not be your front door." canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{['Up to 3 minutes', 'Up to 5 minutes', 'Up to 10 minutes', 'Up to 15 minutes'].map((value) => <Choice key={value} label={value} selected={form.maxPickupWalk === value} onClick={() => update({ maxPickupWalk: value })} testId={`choice-walk-${value.replace(/\W/g, '-').toLowerCase()}`} />)}</div></QuestionFrame>;
  if (step === 7 && form.role === 'driver') {
    const selected = driverRateOptions.find((option) => option.value === form.driverRateSelection);
    const monthly = form.driverRateCents == null ? null : Math.round((form.driverRateCents / 100) * weeklyTripCount(form.schedule) * 4.33);
    return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="8 · Driver economics" title="What’s the least you’d want to earn for one passenger on one trip?" subtitle="One trip means driving to campus OR driving home. Taking someone both ways counts as two paid trips." canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{driverRateOptions.map((option) => <Choice key={option.value} label={option.label} selected={form.driverRateSelection === option.value} onClick={() => update({ driverRateSelection: option.value, driverRateCents: option.cents })} testId={`choice-driver-rate-${option.value}`} />)}</div>{selected?.value === 'custom' && <div className="field"><label htmlFor="driver-custom-rate">Custom amount in CAD per passenger per trip</label><input id="driver-custom-rate" type="number" min="0" step="0.01" value={form.driverRateCents == null ? '' : form.driverRateCents / 100} onChange={(event) => update({ driverRateCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} data-testid="input-driver-custom-rate" /></div>}{monthly !== null && <p className="economics-callout">At {weeklyTripCount(form.schedule)} trips a week with one passenger, that’s about <strong>${monthly} a month.</strong></p>}<p className="field-note">Example only, assuming one passenger on every selected trip. Actual earnings depend on completed rides.</p></QuestionFrame>;
  }
  if (step === 7) {
    const selected = riderPriceOptions.find((option) => option.value === form.riderPriceSelection);
    return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="8 · Rider budget" title="What’s the most you’d pay per month for these rides?" subtitle="Choose the highest monthly amount you’d realistically pay for the schedule you selected." canContinue={canContinue} onBack={goBack} onContinue={next}><p className="trip-count-callout">Your selection: <strong>{weeklyTripCount(form.schedule)} one-way rides per week.</strong><span>A trip to campus and a trip home count as two rides.</span></p><div className="choice-grid">{riderPriceOptions.map((option) => <Choice key={option.value} label={option.label} selected={form.riderPriceSelection === option.value} onClick={() => update({ riderPriceSelection: option.value, riderPriceCents: option.cents })} testId={`choice-rider-price-${option.value}`} />)}</div>{selected?.value === 'custom' && <div className="field"><label htmlFor="rider-custom-price">Custom monthly amount in CAD</label><input id="rider-custom-price" type="number" min="0" step="1" value={form.riderPriceCents == null ? '' : form.riderPriceCents / 100} onChange={(event) => update({ riderPriceCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} data-testid="input-rider-custom-price" /></div>}<p className="field-note">We’re checking budgets. These aren’t confirmed prices.</p></QuestionFrame>;
  }
  if (step === 8) return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="9 · Main concern" title="What could stop you from using this?" subtitle="Choose the concern that matters most to you. This helps us improve the idea." canContinue={canContinue} onBack={goBack} onContinue={next}><div className="choice-grid">{['The price', 'My driver or rider cancelling', 'Safety or trust', 'Pickup location', 'The times would not work', 'I would rather use the bus or drive myself', 'I’m not sure yet', 'Something else'].map((value) => <Choice key={value} label={value} selected={form.finalConcern === value} onClick={() => update({ finalConcern: value, finalConcernOther: value === 'Something else' ? form.finalConcernOther : null })} testId={`choice-final-concern-${value.replace(/\W/g, '-').toLowerCase()}`} />)}</div>{form.finalConcern === 'Something else' && <div className="field"><label htmlFor="final-concern-other">Tell us what you have in mind</label><input id="final-concern-other" value={form.finalConcernOther ?? ''} onChange={(event) => update({ finalConcernOther: event.target.value || null })} data-testid="input-final-concern-other" /></div>}</QuestionFrame>;
  return <QuestionFrame {...frameRoleProps} step={step} total={total} kicker="10 · Contact" title="How can we contact you if we find a possible match?" subtitle="You can leave your phone number, email, or both. We’ll only use your information for this commute project." canContinue={canContinue} onBack={goBack} onContinue={next} continueLabel="Submit survey" pending={createResponse.isPending}><NewContactFields form={form} update={update} />{createResponse.isError && <p className="field-error submit-error">We could not save that just now. Check your connection and try again.</p>}</QuestionFrame>;
}

function SuccessPage({ response, onBackHome }: { response: ResponseInput; onBackHome: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareText = 'Hey, I’m helping validate a carpool service for U of M students in Sage Creek. It could help drivers earn money and riders find regular rides. Can you fill out this short survey?';
  const copyLink = async () => {
    await navigator.clipboard?.writeText(canonicalSurveyUrl);
    setCopied(true);
  };
  const share = async () => {
    const shareData = { title: 'Sage Creek Commute', text: shareText, url: canonicalSurveyUrl };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard?.writeText(`${shareText} ${canonicalSurveyUrl}`);
        setCopied(true);
      }
    } catch {
      // A cancelled native share is not an error state for the experience.
    }
  };
  return (
    <div className="question-shell">
      <div className="question-top"><div className="question-nav-row"><Link href="/" className="question-brand" data-testid="link-success-brand"><Brand /></Link><span className="eyebrow">All set</span></div><div className="progress-track"><div className="progress-fill" style={{ width: '100%' }} /></div></div>
      <main className="question-main success-main">
        <div className="success-mark"><CheckCircle2 size={34} /></div>
        <div className="eyebrow">Survey complete</div>
        <h1 className="question-title mt-5">Thanks — your answers will help us see which commutes could work.</h1>
        {response.contactPermission && <p className="question-subtitle">We’ll contact you if we find a possible match.</p>}
        <div className="share-card">
          <div className="eyebrow">Pass it along</div>
          <h2>Know another U of M student in Sage Creek?</h2>
          <p>More drivers and riders give everyone a better chance of finding a commute that works.</p>
          <div className="success-actions">
            <button className="btn-primary" onClick={share} data-testid="button-share-commute">Share this survey <ExternalLink size={16} /></button>
            <button className="btn-quiet" onClick={copyLink} data-testid="button-copy-survey-link">{copied ? 'Link copied' : 'Copy link'} {copied ? <Check size={16} /> : <Clipboard size={16} />}</button>
          </div>
        </div>
        <Link href="/" onClick={onBackHome} className="btn-quiet success-home-link" data-testid="link-success-home">Back to Sage Creek Commute</Link>
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
  const [role, setRole] = useState<Role | null>(() => readStoredRole());
  const [submitted, setSubmitted] = useState<ResponseInput | null>(null);
  const createEvent = useCreateEvent();
  const selectRole = (nextRole: Role) => {
    trackEvent(
      createEvent.mutate,
      nextRole === 'driver' ? EventInputEventName.driver_role_selected : EventInputEventName.rider_role_selected,
      nextRole,
    );
    window.localStorage.setItem(selectedRoleKey, nextRole);
    setRole(nextRole);
  };
  const backHome = () => {
    setSubmitted(null);
    setRole(null);
    window.localStorage.removeItem(selectedRoleKey);
    window.localStorage.removeItem(surveyDraftKey);
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
          <ResponseField label="Survey version" value={response.surveyVersion} />
          <ResponseField label="Lives in Sage Creek" value={response.livesInSageCreek ? 'Yes' : 'No'} />
          <ResponseField label="Outside Sage Creek flag" value={response.livesOutsideSageCreek ? 'Yes' : 'No'} />
          {response.neighborhood && <ResponseField label="Neighbourhood" value={response.neighborhood} />}
          <ResponseField label="Student status" value={response.studentStatus} />
          <ResponseField label="U of M student" value={response.isUofMStudent ? 'Yes' : 'No'} />
          <ResponseField label="Weekly one-way trips" value={String(response.weeklyTripCount)} />
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
          <ResponseField label="Attribution" value={response.posterSource === 'direct_unknown' ? 'Direct/Unknown' : response.posterSource} />
          {utmValues && <ResponseField label="Source / UTM" value={utmValues} />}
          {response.referrer && <ResponseField label="Referrer" value={response.referrer} />}
          {response.role === 'driver' && response.maxDetour && <ResponseField label="Maximum detour" value={response.maxDetour} />}
          {response.role === 'driver' && response.seats && <ResponseField label="Students they would take" value={response.seats} />}
          {response.role === 'driver' && response.minimumMonthlyCompensation && <ResponseField label="Minimum monthly compensation" value={response.minimumMonthlyCompensation} />}
          {response.role === 'driver' && response.driverRateSelection && <ResponseField label="Driver rate selection" value={response.driverRateSelection} />}
          {response.role === 'driver' && response.driverRateCents != null && <ResponseField label="Driver rate cents" value={String(response.driverRateCents)} />}
          {response.role === 'rider' && response.maxPickupWalk && <ResponseField label="Maximum pickup walk" value={response.maxPickupWalk} />}
          {response.role === 'rider' && response.currentTransportMethod && <ResponseField label="Current transportation" value={response.currentTransportMethod} />}
          {response.role === 'rider' && response.currentCommuteDuration && <ResponseField label="Usual commute duration" value={response.currentCommuteDuration} />}
          {response.role === 'rider' && response.maximumMonthlyWillingnessToPay && <ResponseField label="Maximum monthly willingness to pay" value={response.maximumMonthlyWillingnessToPay} />}
          {response.role === 'rider' && response.riderPriceSelection && <ResponseField label="Rider price selection" value={response.riderPriceSelection} />}
          {response.role === 'rider' && response.riderPriceCents != null && <ResponseField label="Rider price cents" value={String(response.riderPriceCents)} />}
          {response.finalConcern && <ResponseField label="Final concern" value={response.finalConcern} />}
          {response.finalConcernOther && <ResponseField label="Final concern details" value={response.finalConcernOther} />}
          {response.firstName && <ResponseField label="First name" value={response.firstName} />}
          <ResponseField label="Contact method" value={response.contactMethod ?? 'none'} />
          <ResponseField label="Contact permission" value={response.contactPermission ? 'Yes' : 'No'} />
        </div>
        <div className="response-schedule">
          <div className="eyebrow">Active commute days</div>
           {activeDays.length ? activeDays.map((day) => <div className="response-schedule-day" key={day.day}><strong>{day.day.slice(0, 3).toUpperCase()}</strong><span>{day.directions?.join(' + ') ?? 'legacy'} · {day.arrival} → {day.departure}</span></div>) : <p className="empty-admin">No active commute days.</p>}
        </div>
      </div>
    </details>
  );
}

type RegistryDraft = {
  locationName: string;
  latitude: string;
  longitude: string;
};

function PosterAttributionSection({
  attribution,
  registry,
  password,
}: {
  attribution: AttributionSummary[];
  registry: PosterRegistryItem[];
  password: string;
}) {
  const request = useMemo(() => ({ headers: { 'X-Admin-Password': password } }), [password]);
  const updatePoster = useUpdateAdminPoster({ request });
  const [drafts, setDrafts] = useState<Record<string, RegistryDraft>>({});
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(registry.map((entry) => [
      entry.posterId,
      {
        locationName: entry.locationName ?? '',
        latitude: entry.latitude == null ? '' : String(entry.latitude),
        longitude: entry.longitude == null ? '' : String(entry.longitude),
      },
    ])));
  }, [registry]);

  const save = (posterId: PosterSource) => {
    const draft = drafts[posterId];
    if (!draft) return;
    const latitude = draft.latitude.trim() === '' ? null : Number(draft.latitude);
    const longitude = draft.longitude.trim() === '' ? null : Number(draft.longitude);
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
      setErrorSource(posterId);
      return;
    }
    setErrorSource(null);
    updatePoster.mutate({
      posterId,
      data: {
        locationName: draft.locationName.trim() || null,
        latitude,
        longitude,
      },
    }, {
      onSuccess: () => setSavedSource(posterId),
      onError: () => setErrorSource(posterId),
    });
  };

  return (
    <div className="admin-card attribution-card mt-5">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Independent attribution</div>
          <h3 className="mt-2">QR landing visits</h3>
          <p className="section-note">Unique visitors are estimated with an anonymous browser identifier, not verified people. Landing visits measure page loads, not camera scans.</p>
        </div>
        <span className="data-note">P01–P03 + Direct/Unknown</span>
      </div>
      <div className="attribution-table mt-5">
        <div className="attribution-row attribution-head">
          <span>Source</span><span>Landing visits</span><span>Estimated visitors</span><span>Starts</span><span>Completed</span><span>Completion</span><span>QR file</span>
        </div>
        {attribution.map((item) => (
          <div className="attribution-row" key={item.posterId}>
            <div><strong>{item.label}</strong>{item.locationName && <small>{item.locationName}</small>}</div>
            <strong>{item.landingVisits}</strong>
            <strong>{item.estimatedUniqueVisitors}</strong>
            <strong>{item.surveyStarts}</strong>
            <strong>{item.completedSurveys}</strong>
            <strong>{(item.completionRate * 100).toFixed(1)}%</strong>
            {item.posterId === 'direct_unknown'
              ? <span className="data-note">—</span>
              : <a className="qr-download-link" href={`/api/posters/${item.posterId}/qr.svg`} download={`poster-${item.posterId.slice(1).toLowerCase()}.svg`}>Download</a>}
          </div>
        ))}
      </div>
      <div className="poster-registry mt-6">
        <div className="eyebrow">Poster registry</div>
        <p className="section-note">Add final pin details when ready. Blank values are intentionally left unknown.</p>
        {registry.filter((entry) => entry.posterId !== 'direct_unknown').map((entry) => {
          const draft = drafts[entry.posterId] ?? { locationName: '', latitude: '', longitude: '' };
          const posterId = entry.posterId as PosterSource;
          return (
            <div className="poster-registry-row" key={entry.posterId}>
              <strong>{entry.posterId}</strong>
              <input className="admin-input" value={draft.locationName} placeholder="Location name" onChange={(event) => setDrafts((current) => ({ ...current, [entry.posterId]: { ...draft, locationName: event.target.value } }))} />
              <input className="admin-input" value={draft.latitude} placeholder="Latitude" inputMode="decimal" onChange={(event) => setDrafts((current) => ({ ...current, [entry.posterId]: { ...draft, latitude: event.target.value } }))} />
              <input className="admin-input" value={draft.longitude} placeholder="Longitude" inputMode="decimal" onChange={(event) => setDrafts((current) => ({ ...current, [entry.posterId]: { ...draft, longitude: event.target.value } }))} />
              <button className="btn-quiet" type="button" onClick={() => save(posterId)} disabled={updatePoster.isPending}>{updatePoster.isPending ? 'Saving…' : savedSource === entry.posterId ? 'Saved' : 'Save'}</button>
              {errorSource === entry.posterId && <span className="field-error">Use numeric coordinates.</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminDashboard({ password }: { password: string }) {
  const [filter, setFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [weekdayFilter, setWeekdayFilter] = useState('all');
  const [arrivalFilter, setArrivalFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [dealbreakerFilter, setDealbreakerFilter] = useState('all');
  const [reliabilityFilter, setReliabilityFilter] = useState('all');
  const request = useMemo(() => ({ headers: { 'X-Admin-Password': password } }), [password]);
  const dateParams = useMemo(() => ({
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  }), [fromDate, toDate]);
  const summaryQuery = useGetAdminSummary(dateParams, { query: { enabled: Boolean(password), queryKey: getGetAdminSummaryQueryKey(dateParams) }, request });
  const responsesQuery = useGetAdminResponses(dateParams, { query: { enabled: Boolean(password), queryKey: getGetAdminResponsesQueryKey(dateParams) }, request });
  const exportQuery = useExportAdminResponses(dateParams, { query: { enabled: false, queryKey: getExportAdminResponsesQueryKey(dateParams) }, request });
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
      <div className="admin-card attribution-filters mt-8"><div className="section-heading"><div><div className="eyebrow">Reporting window</div><h3 className="mt-2">Filter attribution and responses by date</h3></div><button className="btn-quiet" type="button" onClick={() => { setFromDate(''); setToDate(''); }}>Clear dates</button></div><div className="date-filter-fields mt-4"><label>From<input className="admin-input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input className="admin-input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div></div>
     <div className="admin-stat-grid"><AdminStat value={total} label="total responses" /><AdminStat value={summary?.drivers ?? 0} label="drivers (unique)" accent /><AdminStat value={summary?.riders ?? 0} label="riders (unique)" /><AdminStat value={(summary?.interestedDrivers ?? 0) + (summary?.interestedRiders ?? 0)} label="definitely / probably (unique)" accent /></div>
      <PosterAttributionSection attribution={summary?.attribution ?? []} registry={summary?.posterRegistry ?? []} password={password} />
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
  const [started, setStarted] = useState<Role | null>(() => readStoredRole());
  const [submitted, setSubmitted] = useState<ResponseInput | null>(null);
  const backHome = () => {
    setSubmitted(null);
    setStarted(null);
    window.localStorage.removeItem(selectedRoleKey);
    window.localStorage.removeItem(surveyDraftKey);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  if (submitted) return <SuccessPage response={submitted} onBackHome={backHome} />;
  if (started) return <Questionnaire initialRole={started} onComplete={(response) => setSubmitted(response)} onExit={() => { setStarted(null); window.localStorage.removeItem(selectedRoleKey); window.localStorage.removeItem(surveyDraftKey); }} />;
  return <LandingPage onStart={(role) => { window.localStorage.setItem(selectedRoleKey, role); setStarted(role); }} />;
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
