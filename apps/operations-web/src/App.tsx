import "./App.css";
import { AppRouter } from "./app/AppRouter";
import { OperationsProvider } from "./operations/OperationsContext";

export default function App() {
  return (
    <OperationsProvider>
      <AppRouter />
    </OperationsProvider>
  );
}
