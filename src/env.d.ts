/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => object;
        Map: new (container: HTMLElement, options: object) => object;
        Marker: new (options: { position: object }) => { setMap: (map: object) => void };
      };
    };
  }
}

export {};
