import React, { createContext, useContext, useState } from 'react';

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  return (
    <LocationContext.Provider value={{ selectedLocation, setSelectedLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext) || { selectedLocation: 'All Locations', setSelectedLocation: () => {} };
}

export default LocationContext;
