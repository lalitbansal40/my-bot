import { Client, AddressType } from "@googlemaps/google-maps-services-js";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(".env") });
/* -------------------- GOOGLE MAPS SETUP -------------------- */
const client = new Client({});
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_KEY!;

/* -------------------- REFERENCE POINT -------------------- */
// Vivek Vihar Mod, Jagatpura
const REFERENCE_COORDS = {
  lat: 26.838606673565817,
  lng: 75.82641420437723,
};

const MAX_DISTANCE_KM = 20;

/* -------------------- INTERFACE -------------------- */
export interface StructuredAddress {
  houseNo: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  fullAddress: string;
  distanceFromReferenceKm: number;
  latitude: number;
  longitude: number;
}

/* -------------------- DISTANCE CALCULATION -------------------- */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* -------------------- MAIN FUNCTION -------------------- */
export const getStructuredAddress = async (
  rawAddress: string
): Promise<StructuredAddress | string | null> => {
  try {
    const response = await client.geocode({
      params: {
        address: rawAddress,
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    if (!response.data.results.length) {
      return "No address found";
    }

    const result = response.data.results[0];
    const { lat, lng } = result.geometry.location;

    /* -------- Distance Check -------- */
    const distance = calculateDistance(
      REFERENCE_COORDS.lat,
      REFERENCE_COORDS.lng,
      lat,
      lng
    );

    if (distance > MAX_DISTANCE_KM) {
      return `Address is too far (${distance.toFixed(
        2
      )} km). We only deliver within 20 km of Jagatpura, Jaipur.`;
    }

    /* -------- Address Components -------- */
    const components = result.address_components;

    const getComponent = (types: AddressType[]) =>
      components.find(c => types.some(t => c.types.includes(t)))?.long_name ||
      "";

    /* -------- Final Structured Address -------- */
    return {
      houseNo: getComponent([
        AddressType.subpremise,
        AddressType.street_number,
      ]),
      landmark: getComponent([
        AddressType.landmark,
        AddressType.point_of_interest,
      ]),
      locality: getComponent([
        AddressType.sublocality,
        AddressType.neighborhood,
      ]),
      city: getComponent([AddressType.locality]),
      state: getComponent([AddressType.administrative_area_level_1]),
      pincode: getComponent([AddressType.postal_code]),
      fullAddress: result.formatted_address,
      distanceFromReferenceKm: +distance.toFixed(2),
      latitude: lat,
      longitude: lng,
    };
  } catch (error) {
    console.error("❌ Error fetching address:", error);
    return null;
  }
};
