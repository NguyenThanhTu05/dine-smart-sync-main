import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireRole } from "@/components/RequireRole";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import StaffLayout from "./layouts/StaffLayout";
import StaffTablesPage from "./pages/staff/StaffTables";
import ContactsPage from "./pages/shared/ContactsPage";
import MePage from "./pages/shared/MePage";
import DesktopLayout from "./layouts/DesktopLayout";
import CashierTablesPage from "./pages/cashier/CashierTables";
import BillsPage from "./pages/cashier/BillsPage";
import KitchenLayout from "./layouts/KitchenLayout";
import KitchenPage from "./pages/kitchen/KitchenPage";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import StaffManagement from "./pages/admin/StaffManagement";
import MenuAndInventory from "./pages/admin/MenuAndInventory";
import AreasPage from "./pages/admin/AreasPage";
import PaymentSettings from "./pages/admin/PaymentSettings";
import { Loader2 } from "lucide-react";
import AIAssistantWidget from '@/components/AIAssistantWidget' 

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
  return <AIAssistantWidget />
}
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
          <AdminOnly />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
