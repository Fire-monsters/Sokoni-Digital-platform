import "./App.css";
import { AppRouter } from "./app/AppRouter";
import { AuthProvider } from "./auth/AuthContext";
import { OperationsProvider } from "./operations/OperationsContext";

export default function App() {
  return (
    <AuthProvider>
      <OperationsProvider>
        <AppRouter />
      </OperationsProvider>
    </AuthProvider>
  );
}
