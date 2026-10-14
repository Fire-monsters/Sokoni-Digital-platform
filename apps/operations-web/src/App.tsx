import { operationsQueryClient } from "./operations/service";
import { ApiProvider } from "@sokoni-digital/api-client/react";
import "./App.css";
import { AppRouter } from "./app/AppRouter";
import { OperationsProvider } from "./operations/OperationsContext";

export default function App() {
  return (
    <ApiProvider client={operationsQueryClient}>
      <OperationsProvider>
        <AppRouter />
      </OperationsProvider>
    </ApiProvider>
  );
}
