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
    const ring = active ? "box-shadow:0 0 0 6px rgba(162,59,46,0.35);" : "";
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
      center: [30, 90],
      zoom: 2,
      minZoom: 2,
      maxZoom: 7,
      worldCopyJump: false,
      scrollWheelZoom: false,
      dragging: true,
      tap: true,
    });
    this._tileLayer(map);

    // --- 경도 보정(날짜변경선 문제 해결) ---
    // 하와이(서경 -157)와 일본(동경 132)이 세계지도의 양 끝으로 갈라져
    // 경로선이 지도를 가로지르는 혼란을 막는다.
    // 유럽(음수~양수 소)을 기준으로, 서경 -30 미만(아메리카/태평양 동쪽)은
    // +360 하여 유럽 → 일본 → 하와이가 왼쪽에서 오른쪽으로 연속되게 만든다.
    function dispLng(lng) {
      return lng < -30 ? lng + 360 : lng;
    }
    const latLng = (ev) => [ev.lat, dispLng(ev.lng)];

    // 모든 사건 핀이 한 화면에 들어오도록 경계에 맞춰 축소.
    // 컨테이너 크기가 아직 0일 수 있어, 크기를 다시 재고 여러 번 재시도한다.
    const bounds = L.latLngBounds(events.map(latLng));
    function fitAll() {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 4 });
    }
    // 레이아웃이 잡히는 시점마다 재조정(최초 렌더·탭 전환·폰트 로드 대비)
    [60, 250, 600, 1200].forEach((ms) => setTimeout(fitAll, ms));
    window.addEventListener("resize", () => map.invalidateSize());

    const markers = {};
    events.forEach((ev) => {
      const mk = L.marker(latLng(ev), {
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
      .map(latLng);
    L.polyline(path, {
      color: "#a23b2e",
      weight: 2.5,
      opacity: 0.6,
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

    // 선택한 핀을 강조하되, 세계지도 전체 시야는 유지(패닝하지 않음)
    function focus(id) {
      const entry = markers[id];
      if (!entry) return;
      setActive(id);
    }

    return { map, markers, focus, setActive };
  },
};

window.WAR_MAP = WAR_MAP;
