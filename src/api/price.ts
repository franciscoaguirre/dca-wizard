/**
 * DOT Price Fetching Hook
 * Fetches DOT/USD price from CoinGecko API with caching
 */

import { useState, useEffect } from 'react';

interface PriceCache {
  price: number;
  timestamp: number;
}

const CACHE_DURATION_MS = 60_000; // 60 seconds
const FALLBACK_PRICE = 5.0;
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd';

let priceCache: PriceCache | null = null;

async function fetchDotPrice(): Promise<number> {
  // Check cache first
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION_MS) {
    return priceCache.price;
  }

  try {
    const response = await fetch(COINGECKO_API);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: { polkadot?: { usd?: number } } = await response.json();
    const price = data?.polkadot?.usd;

    if (typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid price data');
    }

    // Update cache
    priceCache = { price, timestamp: Date.now() };
    return price;
  } catch (error) {
    console.warn('Failed to fetch DOT price, using fallback:', error);
    return priceCache?.price ?? FALLBACK_PRICE;
  }
}

export interface UseDotPriceResult {
  price: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDotPrice(): UseDotPriceResult {
  const [price, setPrice] = useState<number>(priceCache?.price ?? FALLBACK_PRICE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    setIsLoading(true);
    setError(null);
    fetchDotPrice()
      .then((newPrice) => {
        setPrice(newPrice);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch price');
        setIsLoading(false);
      });
  };

  useEffect(() => {
    refetch();

    // Refresh price every 60 seconds
    const interval = setInterval(refetch, CACHE_DURATION_MS);
    return () => clearInterval(interval);
  }, []);

  return { price, isLoading, error, refetch };
}
