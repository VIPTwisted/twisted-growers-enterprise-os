import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import Login from './screens/Login.jsx'
import Shell from './components/Shell.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Dashboard from './screens/Cockpit.jsx'
import Schedule from './screens/Schedule.jsx'
import EmployeeFile from './screens/EmployeeFile.jsx'
import ScheduleCalendar from './screens/ScheduleCalendar.jsx'
import Communications from './screens/Communications.jsx'
import AttendanceManager from './screens/AttendanceManager.jsx'
import Maintenance from './screens/Maintenance.jsx'
import ShiftBookends from './screens/ShiftBookends.jsx'
import AiCeo from './screens/AiCeo.jsx'
import Requests from './screens/Requests.jsx'
import Training from './screens/Training.jsx'
import Forms from './screens/Forms.jsx'
import Settings from './screens/Settings.jsx'
import Inventory from './screens/Inventory.jsx'
import Products from './screens/Products.jsx'

// Lazy-loaded new screens
import { lazy, Suspense } from 'react'
const CalloutTracker = lazy(() => import('./screens/CalloutTracker.jsx'))
const Roster         = lazy(() => import('./screens/Roster.jsx'))
const MyHome         = lazy(() => import('./screens/MyHome.jsx'))
const Chat         = lazy(() => import('./screens/Chat.jsx'))
const TimeClock    = lazy(() => import('./screens/TimeClock.jsx'))
const Tasks        = lazy(() => import('./screens/Tasks.jsx'))
const Compliments  = lazy(() => import('./screens/Compliments.jsx'))
const AdminPanel   = lazy(() => import('./screens/AdminPanel.jsx'))
const Incidents    = lazy(() => import('./screens/Incidents.jsx'))
const Reviews      = lazy(() => import('./screens/Reviews.jsx'))
const Onboarding   = lazy(() => import('./screens/Onboarding.jsx'))
const ATS          = lazy(() => import('./screens/ATS.jsx'))
const Documents    = lazy(() => import('./screens/Documents.jsx'))
const Policies     = lazy(() => import('./screens/Policies.jsx'))
const Sales        = lazy(() => import('./screens/Sales.jsx'))
const Leaderboards = lazy(() => import('./screens/Leaderboards.jsx'))
const Contests     = lazy(() => import('./screens/Contests.jsx'))
const Goals        = lazy(() => import('./screens/Goals.jsx'))
const Spiffs       = lazy(() => import('./screens/Spiffs.jsx'))
const HQDocs       = lazy(() => import('./screens/HQDocs.jsx'))
const Analytics    = lazy(() => import('./screens/Analytics.jsx'))
const Zones        = lazy(() => import('./screens/Zones.jsx'))
const Huddle       = lazy(() => import('./screens/Huddle.jsx'))
const Meetings     = lazy(() => import('./screens/Meetings.jsx'))
const Availability = lazy(() => import('./screens/Availability.jsx'))
const AiScheduler  = lazy(() => import('./screens/AiScheduler.jsx'))
const AiAssist     = lazy(() => import('./screens/AiAssist.jsx'))
const Messages     = lazy(() => import('./screens/Messages.jsx'))
const Manual       = lazy(() => import('./screens/Manual.jsx'))
const DirectDeposit= lazy(() => import('./screens/DirectDeposit.jsx'))
const Merch        = lazy(() => import('./screens/Merch.jsx'))
const ThemeStudio  = lazy(() => import('./screens/ThemeStudio.jsx'))
const AuditLog     = lazy(() => import('./screens/AuditLog.jsx'))
const Promotions   = lazy(() => import('./screens/Promotions.jsx'))
const Coverage     = lazy(() => import('./screens/Coverage.jsx'))
const HROps       = lazy(() => import('./screens/HROps.jsx'))
const Cultivation = lazy(() => import('./screens/Cultivation.jsx'))
const TrainingLMS    = lazy(() => import('./screens/TrainingLMS.jsx'))
const Reports        = lazy(() => import('./screens/Reports.jsx'))
const KpiDashboard   = lazy(() => import('./screens/KpiDashboard.jsx'))
const Disciplinary   = lazy(() => import('./screens/Disciplinary.jsx'))
const HRMessages     = lazy(() => import('./screens/HRMessages.jsx'))
const FeatureToggles = lazy(() => import('./screens/FeatureToggles.jsx'))
const MyDocs         = lazy(() => import('./screens/MyDocs.jsx'))
const DocVault       = lazy(() => import('./screens/DocVault.jsx'))
const AttendanceForensics = lazy(() => import('./screens/AttendanceForensics.jsx'))
const Pipeline       = lazy(() => import('./screens/Pipeline.jsx'))
const Gamification   = lazy(() => import('./screens/Gamification.jsx'))
const Academy        = lazy(() => import('./screens/Academy.jsx'))
const WeeklyDrills   = lazy(() => import('./screens/WeeklyDrills.jsx'))
const Integrations   = lazy(() => import('./screens/Integrations.jsx'))
const AppImport      = lazy(() => import('./screens/AppImport.jsx'))
const DocCenter      = lazy(() => import('./screens/DocCenter.jsx'))
const DocManager     = lazy(() => import('./screens/DocManager.jsx'))
const TrainingTrack  = lazy(() => import('./screens/TrainingTrack.jsx'))
const NavConfig      = lazy(() => import('./screens/NavConfig.jsx'))
const ShiftMarketplace = lazy(() => import('./screens/ShiftMarketplace.jsx'))
const StoreVisits      = lazy(() => import('./screens/StoreVisits.jsx'))
const WorkersComp      = lazy(() => import('./screens/WorkersComp.jsx'))
const ExitInterviews   = lazy(() => import('./screens/ExitInterviews.jsx'))
const FmlaLoa          = lazy(() => import('./screens/FmlaLoa.jsx'))
const Employee360     = lazy(() => import('./screens/Employee360.jsx'))
const Probation       = lazy(() => import('./screens/Probation.jsx'))
const OneOnOnes       = lazy(() => import('./screens/OneOnOnes.jsx'))
const ShiftNotes      = lazy(() => import('./screens/ShiftNotes.jsx'))
const HealthScores    = lazy(() => import('./screens/HealthScores.jsx'))
const CoachingLog     = lazy(() => import('./screens/CoachingLog.jsx'))
const AttendancePoints= lazy(() => import('./screens/AttendancePoints.jsx'))
const SkillsMatrix    = lazy(() => import('./screens/SkillsMatrix.jsx'))
const HRInvestigations= lazy(() => import('./screens/HRInvestigations.jsx'))
const Rehires         = lazy(() => import('./screens/Rehires.jsx'))
const Suspensions     = lazy(() => import('./screens/Suspensions.jsx'))
const CleaningLogs    = lazy(() => import('./screens/CleaningLogs.jsx'))
const TimeClockKiosk  = lazy(() => import('./screens/TimeClockKiosk.jsx'))
const Benefits        = lazy(() => import('./screens/Benefits.jsx'))
const Payroll         = lazy(() => import('./screens/Payroll.jsx'))
const NotifCenter     = lazy(() => import('./screens/NotificationCenter.jsx'))
const OrgChart        = lazy(() => import('./screens/OrgChart.jsx'))
const CTCompliance    = lazy(() => import('./screens/CTCompliance.jsx'))
const EmergencyContacts = lazy(() => import('./screens/EmergencyContacts.jsx'))
const HandbookBuilder   = lazy(() => import('./screens/HandbookBuilder.jsx'))
const ShiftReport       = lazy(() => import('./screens/ShiftReport.jsx'))
const EmployeeHub       = lazy(() => import('./screens/EmployeeHub.jsx'))
const SchedulingHub     = lazy(() => import('./screens/SchedulingHub.jsx'))
const OnboardingHub     = lazy(() => import('./screens/OnboardingHub.jsx'))
const Sign              = lazy(() => import('./screens/Sign.jsx'))
const AvailabilityImport = lazy(() => import('./screens/AvailabilityImport.jsx'))
const TrainingHub       = lazy(() => import('./screens/TrainingHub.jsx'))
const PoliciesHub       = lazy(() => import('./screens/PoliciesHub.jsx'))
const FormsHub          = lazy(() => import('./screens/FormsHub.jsx'))
const HRDashboard       = lazy(() => import('./screens/HRDashboard.jsx'))

// ── New scheduler engine screens (multi-week draft, training, zones) ──
const ScheduleBuilder   = lazy(() => import('./screens/ScheduleBuilder.jsx'))
const TrainingPanel     = lazy(() => import('./screens/TrainingPanel.jsx'))
const ZoneSettings      = lazy(() => import('./screens/ZoneSettings.jsx'))
const ScheduleAudit     = lazy(() => import('./screens/ScheduleAudit.jsx'))
const ForensicCallouts  = lazy(() => import('./screens/ForensicCallouts.jsx'))
const RecruitingBoard   = lazy(() => import('./screens/RecruitingBoard.jsx'))
const TasksBoard        = lazy(() => import('./screens/TasksBoard.jsx'))
const TimeOffBoard      = lazy(() => import('./screens/TimeOffBoard.jsx'))
const IncidentsBoard    = lazy(() => import('./screens/IncidentsBoard.jsx'))
const OnboardingBoard   = lazy(() => import('./screens/OnboardingBoard.jsx'))
const CommandCenter     = lazy(() => import('./screens/CommandCenter.jsx'))
const CoverageMonitor   = lazy(() => import('./screens/CoverageMonitor.jsx'))
const TimecardAccess    = lazy(() => import('./screens/TimecardAccess.jsx'))
const Experience        = lazy(() => import('./screens/Experience.jsx'))
const Pulse             = lazy(() => import('./screens/Pulse.jsx'))
const Insights          = lazy(() => import('./screens/Insights.jsx'))
const Appraisals        = lazy(() => import('./screens/Appraisals.jsx'))
const LearningPaths      = lazy(() => import('./screens/LearningPaths.jsx'))
const ScheduleCenter     = lazy(() => import('./screens/ScheduleCenter.jsx'))
const GreetingsAdmin     = lazy(() => import('./screens/GreetingsAdmin.jsx'))
const HiringPlanner      = lazy(() => import('./screens/HiringPlanner.jsx'))
const LaborBudget        = lazy(() => import('./screens/LaborBudget.jsx'))
const Benchmarking       = lazy(() => import('./screens/Benchmarking.jsx'))
const ComplianceExp      = lazy(() => import('./screens/ComplianceExpirations.jsx'))
const FlightRisk         = lazy(() => import('./screens/FlightRisk.jsx'))
const NineBox            = lazy(() => import('./screens/NineBox.jsx'))
const HelpDesk          = lazy(() => import('./screens/HelpDesk.jsx'))
const VisualScheduleBuilder = lazy(() => import('./screens/VisualScheduleBuilder.jsx'))

function Fallback() {
  return <div className="loader">Loading…</div>
}

export default function App() {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Login />

  return (
    <Shell>
      <Suspense fallback={<Fallback />}>
        <ErrorBoundary key={location.pathname}>
        <Routes>
          {/* ── Core ── */}
          <Route path="/"             element={<Dashboard />} />
          <Route path="/settings"     element={<Settings />} />
          <Route path="/maintenance"  element={<Maintenance />} />

          {/* ── Employees ── */}
          <Route path="/employees"    element={<EmployeeFile />} />
          <Route path="/roster"       element={<Roster />} />
          <Route path="/myhome"       element={<MyHome />} />
          <Route path="/onboarding"   element={<Onboarding />} />
          <Route path="/sign"         element={<Sign />} />
          <Route path="/ats"          element={<ATS />} />
          <Route path="/admin"        element={<AdminPanel />} />

          {/* ── Time & Scheduling ── */}
          <Route path="/shift-marketplace" element={<ShiftMarketplace />} />
          <Route path="/callout"      element={<CalloutTracker />} />
          <Route path="/coverage"     element={<Coverage />} />
          <Route path="/schedule"     element={<Schedule />} />
          <Route path="/cal"          element={<ScheduleCalendar />} />
          <Route path="/bookends"     element={<ShiftBookends />} />
          <Route path="/attendance"   element={<AttendanceManager />} />
          <Route path="/requests"     element={<Requests />} />
          <Route path="/timeclock"         element={<TimeClock />} />
          <Route path="/timeclock-kiosk"  element={<TimeClockKiosk />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="/ai-schedule"  element={<AiScheduler />} />
          <Route path="/zones"        element={<Zones />} />
          <Route path="/schedule-center" element={<ScheduleCenter />} />
          <Route path="/greetings-admin" element={<GreetingsAdmin />} />
          <Route path="/schedule-builder" element={<VisualScheduleBuilder />} />
          <Route path="/schedule-builder-classic" element={<ScheduleBuilder />} />
          <Route path="/training-panel"   element={<TrainingPanel />} />
          <Route path="/zone-settings"    element={<ZoneSettings />} />
          <Route path="/schedule-audit"   element={<ScheduleAudit />} />
          <Route path="/forensic-callouts" element={<ForensicCallouts />} />
          <Route path="/recruiting"       element={<RecruitingBoard />} />
          <Route path="/tasks-board"      element={<TasksBoard />} />
          <Route path="/time-off-board"   element={<TimeOffBoard />} />
          <Route path="/incidents-board"  element={<IncidentsBoard />} />
          <Route path="/onboarding-board" element={<OnboardingBoard />} />
          <Route path="/command-center"   element={<CommandCenter />} />
          <Route path="/coverage-monitor" element={<CoverageMonitor />} />
          <Route path="/timecard-access"  element={<TimecardAccess />} />
          <Route path="/experience"       element={<Experience />} />
          <Route path="/pulse"            element={<Pulse />} />
          <Route path="/insights"         element={<Insights />} />
          <Route path="/helpdesk"         element={<HelpDesk />} />

          {/* ── Payroll ── */}
          <Route path="/forms"        element={<Forms />} />
          <Route path="/direct-deposit" element={<DirectDeposit />} />

          {/* ── Training ── */}
          <Route path="/training"     element={<Training />} />
          <Route path="/reviews"      element={<Reviews />} />
          <Route path="/appraisals"   element={<Appraisals />} />
          <Route path="/learning-paths" element={<LearningPaths />} />
          <Route path="/products"     element={<Products />} />
          <Route path="/manual"       element={<Manual />} />

          {/* ── Communications ── */}
          <Route path="/comms"        element={<Communications />} />
          <Route path="/chat"         element={<Chat />} />
          <Route path="/messages"     element={<Messages />} />
          <Route path="/huddle"       element={<Huddle />} />
          <Route path="/meetings"     element={<Meetings />} />

          {/* ── HR Tools ── */}
          <Route path="/incidents"    element={<Incidents />} />
          <Route path="/policies"     element={<Policies />} />
          <Route path="/documents"    element={<Documents />} />
          <Route path="/hq-docs"      element={<HQDocs />} />
          <Route path="/tasks"        element={<Tasks />} />
          <Route path="/compliments"  element={<Compliments />} />
          <Route path="/hr-ops"       element={<HROps />} />
          <Route path="/cultivation"  element={<Cultivation />} />
          <Route path="/fmla-loa"          element={<FmlaLoa />} />
          <Route path="/workers-comp"      element={<WorkersComp />} />
          <Route path="/exit-interviews"   element={<ExitInterviews />} />
          <Route path="/store-visits"      element={<StoreVisits />} />
          <Route path="/employee-360"      element={<Employee360 />} />
          <Route path="/probation"         element={<Probation />} />
          <Route path="/one-on-ones"       element={<OneOnOnes />} />
          <Route path="/shift-notes"       element={<ShiftNotes />} />
          <Route path="/health-scores"     element={<HealthScores />} />
          <Route path="/coaching-log"      element={<CoachingLog />} />
          <Route path="/attendance-points" element={<AttendancePoints />} />
          <Route path="/skills-matrix"     element={<SkillsMatrix />} />
          <Route path="/hr-investigations" element={<HRInvestigations />} />
          <Route path="/rehires"           element={<Rehires />} />
          <Route path="/suspensions"       element={<Suspensions />} />
          <Route path="/cleaning-logs"     element={<CleaningLogs />} />

          {/* ── Reports & Analytics ── */}
          <Route path="/ai-ceo"       element={<AiCeo />} />
          <Route path="/analytics"    element={<Analytics />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/audit"        element={<AuditLog />} />

          {/* ── Business ── */}
          <Route path="/sales"        element={<Sales />} />
          <Route path="/promotions"   element={<Promotions />} />
          <Route path="/inventory"    element={<Inventory />} />
          <Route path="/contests"     element={<Contests />} />
          <Route path="/goals"        element={<Goals />} />
          <Route path="/spiffs"       element={<Spiffs />} />

          {/* ── Employee Self-Service ── */}
          <Route path="/ai-assist"    element={<AiAssist />} />
          <Route path="/merch"        element={<Merch />} />
          <Route path="/theme-studio" element={<ThemeStudio />} />

          <Route path="/training-lms"     element={<TrainingLMS />} />
          <Route path="/reports"          element={<Reports />} />
          <Route path="/kpi"              element={<KpiDashboard />} />
          <Route path="/disciplinary"     element={<Disciplinary />} />
          <Route path="/hr-messages"      element={<HRMessages />} />
          <Route path="/feature-toggles"  element={<FeatureToggles />} />
          <Route path="/my-docs"          element={<MyDocs />} />
          <Route path="/doc-vault"        element={<DocVault />} />
          <Route path="/attendance-forensics" element={<AttendanceForensics />} />
          <Route path="/pipeline"         element={<Pipeline />} />
          <Route path="/gamification"     element={<Gamification />} />
          <Route path="/academy"          element={<Academy />} />
          <Route path="/weekly-drills"    element={<WeeklyDrills />} />
          <Route path="/integrations"     element={<Integrations />} />
          <Route path="/app-import"       element={<AppImport />} />
          <Route path="/availability-import" element={<AvailabilityImport />} />
          <Route path="/hiring-planner"   element={<HiringPlanner />} />
          <Route path="/labor-budget"     element={<LaborBudget />} />
          <Route path="/benchmarking"     element={<Benchmarking />} />
          <Route path="/compliance-expirations" element={<ComplianceExp />} />
          <Route path="/flight-risk"      element={<FlightRisk />} />
          <Route path="/doc-center"       element={<DocCenter />} />
          <Route path="/doc-manager"      element={<DocManager />} />
          <Route path="/training-track"   element={<TrainingTrack />} />
          <Route path="/nav-config"       element={<NavConfig />} />

          {/* ── Employee Self-Service ── */}
          <Route path="/benefits"       element={<Benefits />} />
          <Route path="/payroll"        element={<Payroll />} />
          <Route path="/org-chart"      element={<OrgChart />} />
          <Route path="/nine-box"       element={<NineBox />} />
          <Route path="/notifications"  element={<NotifCenter />} />
          <Route path="/ct-compliance"      element={<CTCompliance />} />
          <Route path="/emergency-contacts" element={<EmergencyContacts />} />
          <Route path="/handbook"           element={<Suspense fallback={<div>Loading...</div>}><HandbookBuilder /></Suspense>} />
          <Route path="/shift-report"       element={<ShiftReport />} />

          {/* ── Hub Dashboards ── */}
          <Route path="/employee-hub"    element={<EmployeeHub />} />
          <Route path="/scheduling-hub"  element={<SchedulingHub />} />
          <Route path="/onboarding-hub"  element={<OnboardingHub />} />
          <Route path="/training-hub"    element={<TrainingHub />} />
          <Route path="/policies-hub"    element={<PoliciesHub />} />
          <Route path="/forms-hub"       element={<FormsHub />} />
          <Route path="/hr-dashboard"    element={<HRDashboard />} />

          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </Suspense>
    </Shell>
  )
}
