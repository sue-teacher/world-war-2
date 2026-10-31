/* =========================================================================
   제2차 세계대전 탐험 — 지도 (OpenStreetMap + Leaflet)
   실제 지도 타일 위에 주요 사건 위치를 순번과 함께 표시합니다.
   인터넷 연결이 있어야 지도 타일이 로드됩니다.
   ========================================================================= */

const WAR_MAP = {
  _tileLayer(map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
  },

  /* 번호가 들어간 핀 모양 DivIcon 생성 */
  _numberIcon(order, color, active) {
    const size = active ? 44 : 36;
    const ring = active ? "box-shadow:0 0 0 6px rgba(255,209,102,0.35);" : "";
    return L.divIcon({
      className: "war-pin",
      html:
        '<div class="war-pin-dot" style="background:' +
        color +
        ";width:" +
        size +
        "px;height:" +
        size +
        "px;" +
        ring +
        '">' +
        order +
        "</div>",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  },

  /* 세계지도 생성 후 각 사건 마커를 추가.
     onSelect(event) : 마커 클릭 시 호출되는 콜백
     반환: { map, focus(id), setActive(id), markers } */
  build(container, events, onSelect) {
    const map = L.map(container, {
      center: [38, 20],
      zoom: 3,
      minZoom: 2,
      worldCopyJump: true,
      scrollWheelZoom: false,
      dragging: true,
      tap: true,
    });
    this._tileLayer(map);

    const markers = {};
    events.forEach((ev) => {
      const mk = L.marker([ev.lat, ev.lng], {
        icon: this._numberIcon(ev.order, ev.color, false),
        keyboard: true,
        title: ev.order + ". " + ev.title,
        alt: ev.order + "번 사건: " + ev.title,
        riseOnHover: true,
      });
      mk.bindTooltip(ev.order + ". " + ev.title, {
        direction: "top",
        offset: [0, -18],
        className: "war-tooltip",
      });
      mk.on("click", () => onSelect && onSelect(ev));
      mk.on("keypress", (e) => {
        if (e.originalEvent && (e.originalEvent.key === "Enter" || e.originalEvent.key === " ")) {
          onSelect && onSelect(ev);
        }
      });
      mk.addTo(map);
      markers[ev.id] = { marker: mk, event: ev };
    });

    // 사건들을 잇는 경로선(학습 순서 시각화)
    const path = events
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((e) => [e.lat, e.lng]);
    L.polyline(path, {
      color: "#ffd166",
      weight: 2,
      opacity: 0.5,
      dashArray: "6 8",
    }).addTo(map);

    function setActive(id) {
      Object.keys(markers).forEach((key) => {
        const entry = markers[key];
        const isOn = key === id;
        entry.marker.setIcon(
          WAR_MAP._numberIcon(entry.event.order, entry.event.color, isOn)
        );
        entry.marker.setZIndexOffset(isOn ? 1000 : 0);
      });
    }

    function focus(id) {
      const entry = markers[id];
      if (!entry) return;
      setActive(id);
      map.panTo([entry.event.lat, entry.event.lng], { animate: true });
    }

    setTimeout(() => map.invalidateSize(), 200);
    return { map, markers, focus, setActive };
  },
};

window.WAR_MAP = WAR_MAP;
