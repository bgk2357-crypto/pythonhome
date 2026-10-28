"use client";
import { useEffect, useRef, useState } from "react";

type Maps = {
  LatLng: new (lat: number, lng: number) => unknown;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
  Service: { geocode: (options: { query: string }, callback: (status: string, response: { v2?: { addresses?: { x: string; y: string }[] } }) => void) => void; Status: { OK: string } };
};
declare global { interface Window { naver?: { maps: Maps }; } }
export const NAVER_LOCATION_URL = "https://map.naver.com/p/search/" + encodeURIComponent("경기도 안산시 상록구 팔곡일동");
export function NaverMap({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null); const [status, setStatus] = useState(clientId ? "loading" : "link");
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const show = () => {
      if (!active) return;
      const maps = window.naver?.maps; if (!maps?.Service || !ref.current) { setStatus("error"); return; }
      maps.Service.geocode({ query: "경기도 안산시 상록구 팔곡일동" }, (result, response) => {
        if (!active || !ref.current) return;
        const address = response.v2?.addresses?.[0];
        if (result !== maps.Service.Status.OK || !address) { setStatus("error"); return; }
        new maps.Map(ref.current, { center: new maps.LatLng(Number(address.y), Number(address.x)), zoom: 14, zoomControl: true, scrollWheel: false });
        setStatus("ready");
      });
    };
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`;
    script.async = true; script.onload = show; script.onerror = () => { if (active) setStatus("error"); };
    document.head.appendChild(script);
    const timeout = setTimeout(() => { if (active) setStatus(value => value === "loading" ? "error" : value); }, 15000);
    return () => { active = false; clearTimeout(timeout); script.remove(); };
  }, [clientId]);
  return <section className="location-map" aria-label="팔곡일동 네이버 지도">
    {clientId && <div ref={ref} className="naver-map-canvas" />}
    {status !== "ready" && <div className="map-placeholder"><span className="map-symbol" aria-hidden="true">N</span><h3>경기도 안산시 상록구 팔곡일동</h3><p>{status === "loading" ? "지도를 불러오고 있습니다." : "네이버 지도에서 주변 위치와 길찾기를 확인하세요."}</p></div>}
    <div className="map-caption"><span>팔곡일동 주변 지역 · 상세 방문 위치는 전화로 확인해주세요.</span><a href={NAVER_LOCATION_URL} target="_blank" rel="noopener noreferrer">네이버 지도 · 길찾기 ↗</a></div>
  </section>;
}
