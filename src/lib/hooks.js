import { useState, useEffect, useCallback } from 'react';

export function useStorage(key, init) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : (typeof init === 'function' ? init() : init);
    } catch { return typeof init === 'function' ? init() : init; }
  });
  const save = useCallback((v) => {
    setVal(v);
    localStorage.setItem(key, JSON.stringify(v));
  }, [key]);
  return [val, save];
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
