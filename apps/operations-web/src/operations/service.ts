import * as Api from "@sokoni-digital/api-client";
import * as demo from "../demo/service";
import { createFrontendQueryClient } from "@sokoni-digital/api-client/react";
import { frontendConfig } from "../lib/api";
export { ApiError as DemoError } from "@sokoni-digital/api-client";
export const operationsQueryClient = createFrontendQueryClient();

const options = {
  baseUrl: frontendConfig.apiUrl,
  adminBasePath: "/v1/public/operations"
};

function read<Args extends unknown[], Result>(name: string, fn: (options: Api.ApiClientOptions, ...args: Args) => Promise<Result>, local: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> => {
    if (frontendConfig.demoEnabled) return local(...args);
    return operationsQueryClient.fetchQuery({ queryKey: ["operations", name, ...args.filter(arg => !(arg instanceof AbortSignal))], queryFn: () => fn(options, ...args), staleTime: 0 });
  };
}
function write<Args extends unknown[], Result>(fn: (options: Api.ApiClientOptions, ...args: Args) => Promise<Result>, local: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    if (frontendConfig.demoEnabled) return local(...args);
    try {
      const result = await fn(options, ...args);
      await operationsQueryClient.invalidateQueries({ queryKey: ["operations"] });
      return result;
    } catch (error) {
      if (error instanceof Api.ApiError && (error.status === 409 || error.code === "VERSION_CONFLICT"))
        await operationsQueryClient.invalidateQueries({ queryKey: ["operations"] });
      throw error;
    }
  };
}
export const fetchApplicationQueue = read("fetchApplicationQueue", Api.fetchApplicationQueue, demo.fetchApplicationQueue);
export const fetchApplicationReview = read("fetchApplicationReview", Api.fetchApplicationReview, demo.fetchApplicationReview);
export const reviewApplication = write(Api.reviewApplication, demo.reviewApplication);
export const fetchAdminListingQueue = read("fetchAdminListingQueue", Api.fetchAdminListingQueue, demo.fetchAdminListingQueue);
export const fetchAdminPriceQueue = read("fetchAdminPriceQueue", Api.fetchAdminPriceQueue, demo.fetchAdminPriceQueue);
export const approveAdminListing = write(Api.approveAdminListing, demo.approveAdminListing);
export const requestAdminListingChanges = write(Api.requestAdminListingChanges, demo.requestAdminListingChanges);
export const reviewAdminPrice = write(Api.reviewAdminPrice, demo.reviewAdminPrice);
export const fetchPaymentFinanceQueue = read("fetchPaymentFinanceQueue", Api.fetchPaymentFinanceQueue, demo.fetchPaymentFinanceQueue);
export const fetchPaymentFinanceDetail = read("fetchPaymentFinanceDetail", Api.fetchPaymentFinanceDetail, demo.fetchPaymentFinanceDetail);
export const recheckPayment = write(Api.recheckPayment, demo.recheckPayment);
export const reconcilePendingPayments = write(Api.reconcilePendingPayments, demo.reconcilePendingPayments);
export const commandPaymentFinance = write(Api.commandPaymentFinance, demo.commandPaymentFinance);
export const fetchDispatcherDeliveryBoard = read("fetchDispatcherDeliveryBoard", Api.fetchDispatcherDeliveryBoard, demo.fetchDispatcherDeliveryBoard);
export const fetchDispatcherDelivery = read("fetchDispatcherDelivery", Api.fetchDispatcherDelivery, demo.fetchDispatcherDelivery);
export const fetchDispatcherRiders = read("fetchDispatcherRiders", Api.fetchDispatcherRiders, demo.fetchDispatcherRiders);
export const fetchDispatcherNearbyRiders = read("fetchDispatcherNearbyRiders", Api.fetchDispatcherNearbyRiders, demo.fetchDispatcherNearbyRiders);
export const assignDispatcherDelivery = write(Api.assignDispatcherDelivery, demo.assignDispatcherDelivery);
export const performDispatcherDeliveryAction = write(Api.performDispatcherDeliveryAction, demo.performDispatcherDeliveryAction);
export const resolveDispatcherDeliveryIssue = write(Api.resolveDispatcherDeliveryIssue, demo.resolveDispatcherDeliveryIssue);
export const fetchOrderInvestigation = read("fetchOrderInvestigation", Api.fetchOrderInvestigation, demo.fetchOrderInvestigation);
export const addOrderSupportNote = write(Api.addOrderSupportNote, demo.addOrderSupportNote);
export const revealOrderContact = write(Api.revealOrderContact, demo.revealOrderContact);
export const resendOrderNotification = write(Api.resendOrderNotification, demo.resendOrderNotification);
export const escalateOrderToDispatch = write(Api.escalateOrderToDispatch, demo.escalateOrderToDispatch);
export const cancelUnpaidOrder = write(Api.cancelUnpaidOrder, demo.cancelUnpaidOrder);
export const fetchAuditEvents = read("fetchAuditEvents", Api.fetchAuditEvents, demo.fetchAuditEvents);
export const fetchAuditEvent = read("fetchAuditEvent", Api.fetchAuditEvent, demo.fetchAuditEvent);
