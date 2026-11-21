import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contact } from '@/features/messenger/types';

type ContactPage = {
    data: Contact[];
    next_page_url: string | null;
};

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Searches the school's members on the server, a page at a time. A school can
 * have tens of thousands of members, so the full list is never sent to the page.
 */
export function useContactSearch(apiBaseUrl: string, query: string) {
    const [results, setResults] = useState<Contact[]>([]);
    const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const requestId = useRef(0);
    const needle = query.trim();

    const fetchPage = useCallback(async (url: string, append: boolean) => {
        const id = ++requestId.current;
        setLoading(true);
        setFailed(false);

        try {
            const response = await fetch(url, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Contact search failed (${response.status})`);
            }

            const page = (await response.json()) as ContactPage;

            if (id !== requestId.current) {
                return;
            }

            setResults((current) =>
                append ? [...current, ...page.data] : page.data,
            );
            setNextPageUrl(page.next_page_url);
        } catch {
            if (id === requestId.current) {
                setFailed(true);
            }
        } finally {
            if (id === requestId.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (needle === '') {
            // Drop any in-flight response; the results are hidden below.
            requestId.current++;

            return;
        }

        const timer = window.setTimeout(() => {
            const params = new URLSearchParams({ search: needle });
            void fetchPage(`${apiBaseUrl}/contacts?${params}`, false);
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [apiBaseUrl, needle, fetchPage]);

    const loadMore = useCallback(() => {
        if (nextPageUrl && !loading) {
            void fetchPage(nextPageUrl, true);
        }
    }, [nextPageUrl, loading, fetchPage]);

    const idle = needle === '';

    return {
        results: idle ? [] : results,
        loading: !idle && loading,
        failed: !idle && failed,
        hasMore: !idle && nextPageUrl !== null,
        loadMore,
    };
}
