export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
  };
}
