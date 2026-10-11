import { RequireRole } from "@/components/RequireRole";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/authState';
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { lazy,Suspense } from 'react';
import { BrowserRouter,Navigate,Route,Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import DesktopLayout from "./layouts/DesktopLayout";
import KitchenLayout from "./layouts/KitchenLayout";
import StaffLayout from "./layouts/StaffLayout";
const AIAssistantWidget = lazy(() => import('@/components/AIAssistantWidget'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AreasPage = lazy(() => import('./pages/admin/AreasPage'));
const MenuAndInventory = lazy(() => import('./pages/admin/MenuAndInventory'));
const PaymentSettings = lazy(() => import('./pages/admin/PaymentSettings'));
const StaffManagement = lazy(() => import('./pages/admin/StaffManagement'));
const BillsPage = lazy(() => import('./pages/cashier/BillsPage'));
const CashierTablesPage = lazy(() => import('./pages/cashier/CashierTables'));
const KitchenPage = lazy(() => import('./pages/kitchen/KitchenPage'));
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ContactsPage = lazy(() => import('./pages/shared/ContactsPage'));
const MePage = lazy(() => import('./pages/shared/MePage'));
const StaffTablesPage = lazy(() => import('./pages/staff/StaffTables'));

const queryClient = new QueryClient();

function RootRedirect() {
  const { session, role, loading, isRecovery } = useAuth();
  if (loading) return <div className="grid h-screen place-items-center"><Loader2 className="animate-spin"/></div>;
  if (!session || isRecovery) return <Navigate to="/login" replace />;
  if (!role) return <Navigate to="/login" replace />;
  return <Navigate to={`/${role}`} replace />;
}
function AdminOnly() {
  const { role, isRecovery } = useAuth()
  if (role !== 'admin' || isRecovery) return null
  return <Suspense fallback={null}><AIAssistantWidget /></Suspense>
}
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="grid h-screen place-items-center"><Loader2 className="animate-spin"/></div>}>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />

            <Route path="/staff" element={<RequireRole role="staff"><StaffLayout/></RequireRole>}>
              <Route index element={<StaffTablesPage/>} />
              <Route path="search" element={<ContactsPage/>} />
              <Route path="me" element={<MePage/>} />
            </Route>

            {/* Thu ngân: thay Nguyên liệu bằng Khu vực & Bàn */}
            <Route path="/cashier" element={<RequireRole role="cashier"><DesktopLayout rolePrefix="cashier" title="Thu ngân"/></RequireRole>}>
              <Route index element={<CashierTablesPage/>} />
              <Route path="bills" element={<BillsPage/>} />
              <Route path="areas" element={<AreasPage/>} />
              <Route path="contacts" element={<ContactsPage/>} />
              <Route path="me" element={<MePage/>} />
            </Route>

            <Route path="/kitchen" element={<RequireRole role="kitchen"><KitchenLayout/></RequireRole>}>
              <Route index element={<KitchenPage/>} />
              <Route path="contacts" element={<ContactsPage/>} />
              <Route path="me" element={<MePage/>} />
            </Route>

            <Route path="/admin" element={<RequireRole role="admin"><AdminLayout/></RequireRole>}>
              <Route index element={<AdminDashboard/>} />
              <Route path="tables" element={<CashierTablesPage/>} />
              <Route path="bills" element={<BillsPage/>} />
              <Route path="areas" element={<AreasPage/>} />
              <Route path="payment" element={<PaymentSettings/>} />
              <Route path="staff" element={<StaffManagement/>} />
             <Route path="catalog" element={<MenuAndInventory/>} />
              <Route path="contacts" element={<ContactsPage/>} />
              <Route path="me" element={<MePage/>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <AdminOnly />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
