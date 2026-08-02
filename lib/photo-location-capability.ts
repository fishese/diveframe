import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativePhotoLocationResult = {
  status: "found" | "missing" | "cancelled" | "permission-denied" | "error";
  latitude?: number;
  longitude?: number;
  tempFileUri?: string;
  fileName?: string;
  contentType?: string;
  photoCopyFailed?: boolean;
  message?: string;
};

interface PhotoLocationPlugin {
  pickPhotoLocation(options: {
    includePhoto: boolean;
  }): Promise<NativePhotoLocationResult>;
  releasePickedPhoto(options: { tempFileUri: string }): Promise<{ released: boolean }>;
}

const nativePlugin = registerPlugin<PhotoLocationPlugin>("PhotoLocation");

export const photoLocationCapability = {
  isAvailable() {
    return (
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("PhotoLocation")
    );
  },

  async pickPhotoLocation(includePhoto: boolean) {
    requireNativePlugin();
    return nativePlugin.pickPhotoLocation({ includePhoto });
  },

  async readPickedPhoto(result: NativePhotoLocationResult): Promise<File | null> {
    if (!result.tempFileUri) return null;
    const response = await fetch(Capacitor.convertFileSrc(result.tempFileUri));
    if (!response.ok) {
      throw new Error("Unable to read the selected photo from Android.");
    }
    const blob = await response.blob();
    return new File([blob], result.fileName || "location-photo.jpg", {
      type: result.contentType || blob.type || "image/jpeg",
    });
  },

  async releasePickedPhoto(tempFileUri?: string) {
    if (!tempFileUri || !photoLocationCapability.isAvailable()) return;
    await nativePlugin.releasePickedPhoto({ tempFileUri });
  },
};

function requireNativePlugin() {
  if (!photoLocationCapability.isAvailable()) {
    throw new Error("The native photo-location picker is unavailable.");
  }
}
