import { useState } from "react";
import RouteListPage from "./RouteListPage";
import RouteDetailPage from "./RouteDetailPage";
import "./RouteComparison.css";

// ─── TOP-LEVEL CONTROLLER ─────────────────────────────────────────────────────
// Drop this into your Dashboard wherever you want the Route Comparison feature.
// It manages its own internal navigation between the route list and route detail.
//
// Usage in Dashboard.js:
//   import RouteComparisonApp from "./RouteComparisonApp";
//   <RouteComparisonApp />
//
// Or as a separate page if you're using React Router:
//   <Route path="/routes" element={<RouteComparisonApp />} />

function RouteComparisonApp() {
  // null = show list, number = show detail for that routeId
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  return (
    <div className="rc-wrapper">
      {selectedRouteId === null ? (
        <RouteListPage onSelectRoute={(id) => setSelectedRouteId(id)} />
      ) : (
        <RouteDetailPage
          routeId={selectedRouteId}
          onBack={() => setSelectedRouteId(null)}
        />
      )}
    </div>
  );
}

export default RouteComparisonApp;