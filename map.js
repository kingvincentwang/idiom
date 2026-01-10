// ===== 路程計算器模組 - 封裝為 IIFE 避免全域污染 =====
(function() {
  'use strict';
  
  // 模組內部變數
  let map;
  let markers = [];
  let waypoints = [];
  let routeLine = null;
  let routingControl = null;
  let currentSearchInput = null;
  let waypointCount = 2;
  let searchTimeout = null;
  
  // DOM 元素快取
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);
  
  // 初始化地圖
  function initMap() {
    map = L.map('rcMap').setView([24.0, 121.0], 8);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    
    map.on('click', function(e) {
      if (currentSearchInput) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        setWaypointLocation(currentSearchInput, lat, lng, `位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    });
  }
  
  // 新增經過點
  function addWaypoint() {
    const container = $('#rcWaypointsContainer');
    const index = waypointCount;
    const letter = String.fromCharCode(65 + index);
    
    const waypointHTML = `
      <div class="rc-waypoint-item" data-index="${index}">
        <div class="rc-waypoint-label">
          <span class="rc-waypoint-number">${letter}</span>
          <span>經過點 ${index - 1}</span>
        </div>
        <div class="rc-search-container">
          <input type="text" class="rc-search-input" placeholder="指定必經地點" data-type="waypoint">
          <div class="rc-search-results"></div>
        </div>
        <button class="rc-remove-waypoint" data-remove-index="${index}">❌ 移除</button>
      </div>
    `;
    
    const endpointItem = container.querySelector('[data-index="1"]');
    endpointItem.insertAdjacentHTML('beforebegin', waypointHTML);
    
    waypointCount++;
    attachSearchListeners();
    attachRemoveListeners();
  }
  
  // 移除經過點
  function removeWaypoint(index) {
    const item = $(`[data-index="${index}"]`);
    if (item) {
      item.remove();
      if (waypoints[index]) {
        if (markers[index]) {
          map.removeLayer(markers[index]);
        }
        waypoints[index] = null;
      }
    }
  }
  
  // 搜尋地點
  async function searchLocation(query, inputElement) {
    if (!query || query.length < 2) return;
    
    const container = inputElement.parentElement;
    const resultsDiv = container.querySelector('.rc-search-results');
    resultsDiv.innerHTML = '<div class="rc-search-loading">🔍 搜尋中...</div>';
    resultsDiv.classList.add('show');
    
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=tw&accept-language=zh-TW`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'RouteCalculator/1.0' }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const results = await response.json();
      
      if (results.length > 0) {
        displaySearchResults(results.map(item => ({
          name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        })), inputElement);
      } else {
        resultsDiv.innerHTML = '<div class="rc-search-no-results">找不到相關地點</div>';
      }
      
    } catch (error) {
      resultsDiv.innerHTML = '<div class="rc-search-error">搜尋失敗</div>';
    }
  }
  
  // 顯示搜尋結果
  function displaySearchResults(results, inputElement) {
    const container = inputElement.parentElement;
    const resultsDiv = container.querySelector('.rc-search-results');
    
    resultsDiv.innerHTML = '';
    
    results.forEach(function(result) {
      const div = document.createElement('div');
      div.className = 'rc-search-result-item';
      div.textContent = result.name;
      div.onclick = function() {
        setWaypointLocation(inputElement, result.lat, result.lng, result.name);
        resultsDiv.classList.remove('show');
      };
      resultsDiv.appendChild(div);
    });
    
    resultsDiv.classList.add('show');
  }
  
  // 設定路徑點位置
  function setWaypointLocation(inputElement, lat, lng, name) {
    inputElement.value = name;
    const item = inputElement.closest('.rc-waypoint-item');
    const index = parseInt(item.dataset.index);
    
    waypoints[index] = { lat, lng, name };
    
    if (markers[index]) {
      map.removeLayer(markers[index]);
    }
    
    const letter = String.fromCharCode(65 + index);
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'rc-custom-marker',
        html: letter,
        iconSize: [28, 28]
      })
    }).addTo(map);
    
    marker.bindPopup(name);
    markers[index] = marker;
    
    if (waypoints.filter(w => w).length > 0) {
      const bounds = L.latLngBounds(waypoints.filter(w => w).map(w => [w.lat, w.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    
    currentSearchInput = null;
  }
  
  // 計算路徑
  async function calculateRoute() {
    const validWaypoints = [];
    const allItems = $$('.rc-waypoint-item');
    
    allItems.forEach(item => {
      const index = parseInt(item.dataset.index);
      if (waypoints[index]) {
        validWaypoints.push({
          ...waypoints[index],
          originalIndex: index,
          isStart: index === 0,
          isEnd: index === 1
        });
      }
    });
    
    if (validWaypoints.length < 2) {
      alert('請至少設定起點和終點');
      return;
    }
    
    const isRoundTrip = $('#rcRoundTripCheckbox').checked;
    
    $('#rcLoading').classList.add('show');
    $('#rcResultPanel').classList.remove('show');
    
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    
    try {
      const optimizedWaypoints = await optimizeWaypointOrder(validWaypoints);
      
      let routeWaypoints = optimizedWaypoints.map(w => L.latLng(w.lat, w.lng));
      
      if (isRoundTrip) {
        const returnWaypoints = optimizedWaypoints.slice(0, -1).reverse();
        returnWaypoints.forEach(w => {
          routeWaypoints.push(L.latLng(w.lat, w.lng));
        });
      }
      
      routingControl = L.Routing.control({
        waypoints: routeWaypoints,
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
          profile: 'driving'
        }),
        lineOptions: {
          styles: [{ color: '#088395', opacity: 0.8, weight: 6 }]
        },
        show: false,
        addWaypoints: false,
        draggableWaypoints: true,
        fitSelectedRoutes: true,
        showAlternatives: false,
        createMarker: function(i, waypoint, n) {
          const waypointData = i < optimizedWaypoints.length ? optimizedWaypoints[i] : null;
          let letter = '';
          
          if (waypointData) {
            if (waypointData.isStart) {
              letter = 'A';
            } else if (waypointData.isEnd) {
              letter = 'B';
            } else {
              let passPointIndex = 0;
              for (let j = 0; j < i; j++) {
                if (optimizedWaypoints[j] && !optimizedWaypoints[j].isStart && !optimizedWaypoints[j].isEnd) {
                  passPointIndex++;
                }
              }
              letter = String.fromCharCode(67 + passPointIndex);
            }
          } else {
            letter = String.fromCharCode(65 + i);
          }
          
          return L.marker(waypoint.latLng, {
            draggable: true,
            icon: L.divIcon({
              className: 'rc-custom-marker',
              html: `<div style="cursor:move;">${letter}</div>`,
              iconSize: [28, 28]
            })
          });
        }
      }).addTo(map);
      
      routingControl.on('routesfound', function(e) {
        const route = e.routes[0];
        displayOptimizedOrder(optimizedWaypoints);
        displayRouteResults({
          distance: route.summary.totalDistance,
          duration: route.summary.totalTime,
          isRoundTrip: isRoundTrip
        });
        $('#rcLoading').classList.remove('show');
      });
      
      routingControl.on('routingerror', function(e) {
        alert('路徑計算失敗，請檢查路徑點');
        $('#rcLoading').classList.remove('show');
      });
      
    } catch (error) {
      alert('路徑計算失敗: ' + error.message);
      $('#rcLoading').classList.remove('show');
    }
  }
  
  // 優化路徑順序
  async function optimizeWaypointOrder(waypoints) {
    if (waypoints.length <= 2) return waypoints;
    
    const start = waypoints.find(w => w.isStart);
    const end = waypoints.find(w => w.isEnd);
    const middle = waypoints.filter(w => !w.isStart && !w.isEnd);
    
    if (!start || !end) return waypoints;
    if (middle.length === 0) return [start, end];
    if (middle.length === 1) return [start, middle[0], end];
    
    const optimizedMiddle = [];
    const remaining = [...middle];
    let current = start;
    
    while (remaining.length > 0) {
      let nearest = null;
      let minDistance = Infinity;
      let nearestIndex = -1;
      
      for (let i = 0; i < remaining.length; i++) {
        const distance = calculateDistance(
          current.lat, current.lng,
          remaining[i].lat, remaining[i].lng
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearest = remaining[i];
          nearestIndex = i;
        }
      }
      
      if (nearest) {
        optimizedMiddle.push(nearest);
        remaining.splice(nearestIndex, 1);
        current = nearest;
      }
    }
    
    return [start, ...optimizedMiddle, end];
  }
  
  // 計算距離
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  // 顯示優化順序
  function displayOptimizedOrder(optimizedWaypoints) {
    const orderHTML = optimizedWaypoints.map((w, i) => {
      let label = '', icon = '';
      if (w.isStart) { label = '起點'; icon = '🏁'; }
      else if (w.isEnd) { label = '終點'; icon = '🎯'; }
      else {
        let passIndex = 0;
        for (let j = 0; j < i; j++) {
          if (!optimizedWaypoints[j].isStart && !optimizedWaypoints[j].isEnd) passIndex++;
        }
        label = `經過點 ${passIndex + 1}`;
        icon = '📍';
      }
      const shortName = w.name.length > 25 ? w.name.substring(0, 25) + '...' : w.name;
      return `<div>${icon} <strong>${label}</strong>: ${shortName}</div>`;
    }).join('');
    
    $('#rcRouteOrder').innerHTML = orderHTML;
    $('#rcRouteInfo').classList.add('show');
  }
  
  // 顯示結果
  function displayRouteResults(data) {
    const distanceKm = (data.distance / 1000).toFixed(2);
    const durationMin = Math.round(data.duration / 60);
    const avgSpeed = (distanceKm / (durationMin / 60)).toFixed(1);
    const pricePerKm = parseFloat($('#rcPricePerKm').value) || 0;
    const travelCost = (distanceKm * pricePerKm).toFixed(0);
    
    $('#rcDistanceResult').textContent = distanceKm;
    $('#rcDurationResult').textContent = durationMin;
    $('#rcSpeedResult').textContent = avgSpeed;
    $('#rcTotalDistance').textContent = distanceKm;
    $('#rcTotalTime').textContent = durationMin;
    
    $('#rcFormulaDistance').textContent = distanceKm;
    $('#rcFormulaPrice').textContent = pricePerKm.toFixed(1);
    $('#rcTravelCost').textContent = travelCost;
    
    const badge = $('#rcTripBadge');
    if (data.isRoundTrip) {
      badge.textContent = '來回';
      badge.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
    } else {
      badge.textContent = '單程';
      badge.style.background = 'var(--rc-gradient-map)';
    }
    
    $('#rcResultPanel').classList.add('show');
  }
  
  // 清除全部
  function clearAll() {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    
    markers.forEach(marker => {
      if (marker) map.removeLayer(marker);
    });
    markers = [];
    waypoints = [];
    
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    
    $$('.rc-search-input').forEach(input => { input.value = ''; });
    
    $$('.rc-waypoint-item').forEach(item => {
      const dataIndex = parseInt(item.dataset.index);
      if (dataIndex !== 0 && dataIndex !== 1) item.remove();
    });
    
    waypointCount = 2;
    $('#rcRoundTripCheckbox').checked = false;
    $('#rcResultPanel').classList.remove('show');
    $('#rcRouteInfo').classList.remove('show');
    $('#rcTotalDistance').textContent = '0';
    $('#rcTotalTime').textContent = '0';
    
    map.setView([24.0, 121.0], 8);
  }
  
  // 綁定搜尋監聽
  function attachSearchListeners() {
    $$('.rc-search-input').forEach(function(input) {
      input.removeEventListener('input', input._inputHandler);
      input.removeEventListener('focus', input._focusHandler);
      input.removeEventListener('blur', input._blurHandler);
      
      input._inputHandler = function(e) {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        if (query.length >= 2) {
          searchTimeout = setTimeout(() => searchLocation(query, e.target), 500);
        }
      };
      input.addEventListener('input', input._inputHandler);
      
      input._focusHandler = function(e) { currentSearchInput = e.target; };
      input.addEventListener('focus', input._focusHandler);
      
      input._blurHandler = function(e) {
        setTimeout(function() {
          const resultsDiv = e.target.parentElement.querySelector('.rc-search-results');
          if (resultsDiv) resultsDiv.classList.remove('show');
        }, 200);
      };
      input.addEventListener('blur', input._blurHandler);
    });
  }
  
  // 綁定移除按鈕
  function attachRemoveListeners() {
    $$('.rc-remove-waypoint').forEach(btn => {
      btn.onclick = function() {
        const index = parseInt(this.dataset.removeIndex);
        removeWaypoint(index);
      };
    });
  }
  
  // 初始化模組
  function init() {
    // 等待 Leaflet 載入
    if (typeof L === 'undefined') {
      setTimeout(init, 100);
      return;
    }
    
    initMap();
    attachSearchListeners();
    
    // 綁定按鈕事件
    $('#rcAddWaypointBtn').onclick = addWaypoint;
    $('#rcCalculateBtn').onclick = calculateRoute;
    $('#rcClearBtn').onclick = clearAll;
    
    console.log('路程計算器模組已載入');
  }
  
  // DOM Ready 後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
