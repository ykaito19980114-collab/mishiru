import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense, useEffect } from "react";
import { Layout } from "./components/Layout";
import { flushQueue } from "./lib/session";
import { AccountAccessProvider } from "./components/AccountAccess";

const Landing = lazy(() => import("./pages/Landing"));
const Discover = lazy(() => import("./pages/Discover"));
const CardDetail = lazy(() => import("./pages/CardDetail"));
const Saved = lazy(() => import("./pages/Saved"));
const Profile = lazy(() => import("./pages/Profile"));
const Questions = lazy(() => import("./pages/Questions"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Consult = lazy(() => import("./pages/Consult"));
const Reflect = lazy(() => import("./pages/Reflect"));
const Labs = lazy(() => import("./pages/Labs"));
const LabDetail = lazy(() => import("./pages/LabDetail"));
const Universities = lazy(() => import("./pages/Universities"));
const UniversityDetail = lazy(() => import("./pages/UniversityDetail"));
const Departments = lazy(() => import("./pages/Departments"));
const DepartmentDetail = lazy(() => import("./pages/DepartmentDetail"));
const Claim = lazy(() => import("./pages/Claim"));
const Policy = lazy(() => import("./pages/Policy"));
const Privacy = lazy(() => import("./pages/Privacy"));
const ForLabs = lazy(() => import("./pages/ForLabs"));
const Admin = lazy(() => import("./pages/admin/Admin"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteLoading() {
  return <div className="mishiru-page py-16" role="status" aria-live="polite"><div className="skeleton h-5 w-28 mb-5" /><div className="skeleton h-12 w-3/4" /><span className="sr-only">画面を読み込んでいます</span></div>;
}

export default function App() {
  useEffect(() => {
    flushQueue(); // 起動時にオフラインキューを再送（FR-ERR-02）
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <HelmetProvider>
      <BrowserRouter>
        <AccountAccessProvider><Layout>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/search" element={<Labs />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/cards/:id" element={<CardDetail />} />
              <Route path="/saved" element={<Saved />} />
              <Route path="/reflect" element={<Reflect />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/questions" element={<Questions />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/consult" element={<Consult />} />
              <Route path="/labs" element={<Labs />} />
              <Route path="/labs/:id" element={<LabDetail />} />
              <Route path="/universities" element={<Universities />} />
              <Route path="/universities/:name" element={<UniversityDetail />} />
              <Route path="/departments" element={<Departments />} />
              <Route path="/departments/:key" element={<DepartmentDetail />} />
              <Route path="/claim" element={<Claim />} />
              <Route path="/policy" element={<Policy />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/for-labs" element={<ForLabs />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Layout></AccountAccessProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}
