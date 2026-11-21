import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contact } from '@/features/messenger/types';

type ContactPage = {
    data: Contact[];
    next_page_url: string | null;
};

const SEARCH_DEBOUNCE_MS = 250;

// The paginator returns an absolute URL; keep only the path and query so a
// proxy's internal host or scheme can never leak into the request.
function sameOriginPath(url: string | null): string | null {
    if (!url) {
        return null;
    }

    const parsed = new URL(url, window.location.origin);

    return `${parsed.pathname}${parsed.search}`;
}

/**
 * Searches the school's members on the server, a page at a time. A school can
 * have tens of thousands of members, so the full list is never sent to the page.
 */
export function useContactSearch(apiBaseUrl: string, query: string) {
    const [results, setResults] = useState<Contact[]>([]);
    const [resultsFor, setResultsFor] = useState('');
    const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const requestId = useRef(0);
    const needle = query.trim();

    const fetchPage = useCallback(
        async (url: string, append: boolean, forNeedle: string) => {
            const id = ++requestId.current;
            setLoading(true);
            setFailed(false);

            try {
                const response = await fetch(url, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                });

                if (!response.ok) {
                    throw new Error(
                        `Contact search failed (${response.status})`,
                    );
                }

                const page = (await response.json()) as ContactPage;

                if (id !== requestId.current) {
                    return;
                }

                setResults((current) =>
                    append ? [...current, ...page.data] : page.data,
                );
                setResultsFor(forNeedle);
                setNextPageUrl(sameOriginPath(page.next_page_url));
            } catch {
                if (id === requestId.current) {
                    setFailed(true);
                }
            } finally {
                if (id === requestId.current) {
                    setLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        if (needle === '') {
            // Drop any in-flight response; the results are hidden below.
            requestId.current++;

            return;
        }

        const timer = window.setTimeout(() => {
            const params = new URLSearchParams({ search: needle });
            void fetchPage(`${apiBaseUrl}/contacts?${params}`, false, needle);
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [apiBaseUrl, needle, fetchPage]);

    const loadMore = useCallback(() => {
        if (nextPageUrl && !loading) {
            void fetchPage(nextPageUrl, true, needle);
        }
    }, [nextPageUrl, loading, fetchPage, needle]);

    const idle = needle === '';
    // Results for an older query are hidden while the new one is pending.
    const current = !idle && resultsFor === needle;

    return {
        results: current ? results : [],
        loading: !idle && (loading || !current),
        failed: !idle && failed,
        hasMore: current && nextPageUrl !== null,
        loadMore,
    };
}
