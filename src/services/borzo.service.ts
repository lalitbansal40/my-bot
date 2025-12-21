import axios, { AxiosInstance, AxiosError } from "axios";

/* =======================
   TYPES & INTERFACES
======================= */

export interface ContactPerson {
  phone: string;
  name?: string;
}

export interface OrderPoint {
  address?: string;        // optional if lat/lng provided
  latitude?: number;
  longitude?: number;
  contact_person: ContactPerson;
}

export interface CalculateOrderData {
  matter: string;
  points: OrderPoint[];

  vehicle_type_id?: number;
  payment_method?: "cash" | "card" | "balance";
  is_contactless?: boolean;
  promo_code?: string;

  [key: string]: any;
}

export interface BorzoError {
  message: string;
}

/**
 * Response from /calculate-order
 */
export interface BorzoCalculatePriceResponse {
  parameter_warnings(arg0: string, warnings: any[], parameter_warnings: any): unknown;
  is_successful: boolean;
  order?: {
    delivery_fee_amount: string; // "45.00"
    payment_amount: string;      // "45.00"
    vehicle_type_id?: number;
    payment_method?: string;
  };
  warnings?: any[];
  errors?: BorzoError[];
}

/**
 * Response from create/edit/cancel order
 */
export interface BorzoOrderResponse {
  is_successful: boolean;
  order_id?: string;
  delivery_id?: string;
  errors?: BorzoError[];
  order?:any;
}

/* =======================
   BORZO API CLIENT
======================= */

export class BorzoApiClient {
  private axios: AxiosInstance;

  constructor(
    private authToken: string,
    useProduction: boolean = false
  ) {
    const baseURL = useProduction
      ? "https://robot-in.borzodelivery.com/api/business/1.6"
      : "https://robotapitest-in.borzodelivery.com/api/business/1.6";

    this.axios = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "X-DV-Auth-Token": this.authToken,
      },
    });
  }

  /* =======================
     INTERNAL ERROR HANDLER
  ======================= */

  private handleError(error: AxiosError): never {
    if (error.response?.data) {
      console.error("Borzo API Error:", error.response.data);
      throw error.response.data;
    }
    console.error("Borzo Network Error:", error.message);
    throw error;
  }

  /* =======================
     API METHODS
  ======================= */

  /** 🔍 Calculate delivery price */
  async calculatePrice(
    data: CalculateOrderData
  ): Promise<BorzoCalculatePriceResponse> {
    try {
      const res = await this.axios.post("/calculate-order", data);
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 📦 Create order */
  async createOrder(
    data: CalculateOrderData
  ): Promise<BorzoOrderResponse> {
    try {
      const res = await this.axios.post("/create-order", data);
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** ✏️ Update order */
  async updateOrder(
    order_id: string,
    data: Partial<CalculateOrderData>
  ): Promise<BorzoOrderResponse> {
    try {
      const res = await this.axios.post("/edit-order", {
        order_id,
        ...data,
      });
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** ❌ Cancel order */
  async cancelOrder(order_id: string): Promise<BorzoOrderResponse> {
    try {
      const res = await this.axios.post("/cancel-order", { order_id });
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 📋 List orders */
  async listOrders(
    start_date?: string,
    end_date?: string
  ): Promise<any> {
    try {
      const params: any = {};
      if (start_date) params.start_date = start_date;
      if (end_date) params.end_date = end_date;

      const res = await this.axios.get("/list-orders", { params });
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 🔎 Get order info */
  async getOrderInfo(order_id: string): Promise<any> {
    try {
      const res = await this.axios.get("/get-order", {
        params: { order_id },
      });
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 🚚 Get courier live location */
  async getCourierLocation(delivery_id: string): Promise<any> {
    try {
      const res = await this.axios.get("/get-delivery-location", {
        params: { delivery_id },
      });
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 👤 Get client profile */
  async getClientProfile(): Promise<any> {
    try {
      const res = await this.axios.get("/get-profile");
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 💳 Get bank cards */
  async getBankCards(): Promise<any> {
    try {
      const res = await this.axios.get("/get-bank-cards");
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /** 🏷️ Get labels */
  async getLabels(): Promise<any> {
    try {
      const res = await this.axios.get("/list-labels");
      return res.data;
    } catch (error) {
      this.handleError(error as AxiosError);
    }
  }

  /* =======================
     HELPER
  ======================= */

  /** ✅ Safely extract delivery fee */
  getDeliveryFee(
    resp: BorzoCalculatePriceResponse
  ): number {
    if (!resp?.order?.delivery_fee_amount) {
      throw new Error("Delivery fee not found in Borzo response");
    }
    return Number(resp.order.delivery_fee_amount);
  }
}
