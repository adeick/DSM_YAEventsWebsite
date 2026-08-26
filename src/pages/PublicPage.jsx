import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import EventList from '../components/EventList'
import ChurchMap from '../components/ChurchMap'
import CommuteForm from '../components/CommuteForm'
import CommuteResults from '../components/CommuteResults'
import { groupMassTimesByChurch, buildMassOptionCards, parseTimeToMinutes } from '../utils/massSchedule'
import { getDefaultDay } from '../utils/commuteDay'
import {
  geocodeAddress,
  fetchDrivingRoute,
  fetchDurationsMatrix,
  MAX_RESULTS,
} from '../utils/commuteRoute'

function getEventIdFromUrl() {
  return new URLSearchParams(window.location.search).get('event')
}

export default function PublicPage({ previewUnpublished = false }) {
  // Owned here (not inside ChurchMap) so the header and sidebar can
  // react to it too, via the data-theme attribute below — CSS
  // variables redefined under [data-theme='dark'] cascade to
  // everything in this tree that references them.
  const [theme, setTheme] = useState('light')
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  // Mirrors `theme` onto document.body itself, in addition to the
  // data-theme prop on the .app div below. Anything rendered via
  // createPortal straight into document.body (EventDetailCard, the
  // Mass-time note popover in ChurchCard) sits OUTSIDE .app in the
  // actual DOM — CSS variables cascade through the real DOM tree, not
  // the React tree, so those portaled elements can only pick up dark
  // mode if the attribute lives on a genuine ancestor of theirs. body
  // is the nearest one that's guaranteed to contain everything.
  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  // Measures the header's real rendered height and exposes it as a
  // CSS variable on document.body, so portaled full-viewport overlays
  // (EventDetailCard) can stop their backdrop at the header's bottom
  // edge instead of covering it. Has to be measured, not hardcoded —
  // the header's height changes across the mobile and short-viewport
  // media queries in styles.css. A ResizeObserver (not just a mount-
  // time measurement) keeps it correct as those breakpoints flip.
  const headerRef = useRef(null)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const setHeaderHeightVar = () => {
      document.body.style.setProperty('--header-height', `${header.offsetHeight}px`)
    }
    setHeaderHeightVar()
    const observer = new ResizeObserver(setHeaderHeightVar)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // Sidebar is always visible on desktop; on mobile it's a hidden
  // overlay toggled by the hamburger button (see the media query in
  // styles.css — this state only has a visible effect below 860px).
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Drives the sidebar's commute UI. 'closed' shows the normal event
  // list; 'form' shows the address inputs; 'loading' disables them
  // while geocoding/routing runs; 'results' shows matched churches.
  // commuteRoute (drawn on the map) is null in the home-only fallback,
  // where there's no route to measure against.
  //
  // Text and resolved-location state live here, not inside
  // CommuteForm, specifically so navigating from results back to the
  // form ("Edit addresses") doesn't remount CommuteForm and lose what
  // was typed — this is the single source of truth for both fields
  // the whole time the commute panel is open.
  const [commuteStatus, setCommuteStatus] = useState('closed')
  const [commuteError, setCommuteError] = useState(null)
  // Full drive-time-sorted list of every reachable church — NOT capped
  // to MAX_RESULTS here, so switching the selected day (which can
  // exclude some churches entirely) still has the rest of the list to
  // draw the next-best options from. Card display + the MAX_RESULTS
  // cap happen in buildMassOptionCards, derived below.
  const [commuteRankedChurches, setCommuteRankedChurches] = useState([])
  const [commuteRoute, setCommuteRoute] = useState(null)
  // Set when a specific Mass time is clicked — a home->church->work
  // route replacing the general home->work line above. Cleared on a
  // new search or a day change, since the previously focused option
  // may no longer be among the displayed cards.
  const [commuteFocusedRoute, setCommuteFocusedRoute] = useState(null)
  const [commuteFocusedChurchId, setCommuteFocusedChurchId] = useState(null)
  const [commuteMassTimes, setCommuteMassTimes] = useState({})
  const [commuteSelectedDay, setCommuteSelectedDay] = useState(getDefaultDay)
  const [commuteHomeText, setCommuteHomeText] = useState('')
  const [commuteWorkText, setCommuteWorkText] = useState('')
  const [commuteHomeLocation, setCommuteHomeLocation] = useState(null)
  const [commuteWorkLocation, setCommuteWorkLocation] = useState(null)
  // Guards against an older click's response overwriting a newer one
  // if someone clicks a second Mass time before the first route finishes.
  const focusRouteRequestIdRef = useRef(0)

  // Events (and which one is selected) live here rather than inside
  // EventList — ChurchMap needs to know the selected event too, so it
  // can fly to its coordinates and drop a pin, and the two components
  // are siblings, not parent/child.
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    document.title = 'Daily Mass Des Moines'
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadEvents() {
      // previewUnpublished (set only by DevPage, behind its login
      // gate) skips the is_published filter so draft events show up
      // too — everywhere else, only published events are fetched.
      let query = supabase
        .from('events')
        .select(
          '*, organizer_org:organizations(name, image_mode, logo_light_url, logo_dark_url, label_light_url, label_dark_url)'
        )
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })

      if (!previewUnpublished) {
        query = query.eq('is_published', true)
      }

      const { data, error } = await query

      if (!isMounted) return

      if (error) {
        setEventsError(error.message)
      } else {
        setEvents(data)
        // Deep-link support: if the URL already names an event (e.g.
        // someone opened a shared link), open its card as soon as the
        // data needed to show it has actually loaded.
        const sharedId = getEventIdFromUrl()
        if (sharedId) {
          const match = data.find((e) => String(e.id) === sharedId)
          if (match) setSelectedEvent(match)
        }
      }
      setEventsLoading(false)
    }

    loadEvents()
    return () => {
      isMounted = false
    }
  }, [previewUnpublished])
  // buttons — pressing back after opening a card should close it
  // (and forward should reopen it), not leave the URL and the
  // visible card disagreeing with each other.
  useEffect(() => {
    function handlePopState() {
      const id = getEventIdFromUrl()
      const match = id ? events.find((e) => String(e.id) === id) : null
      setSelectedEvent(match ?? null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [events])

  function handleSelectEvent(event) {
    setSelectedEvent(event)
    window.history.pushState({}, '', `?event=${event.id}`)
    // No-op on desktop (sidebarOpen only affects the mobile slide-out
    // menu), but on mobile the event card would otherwise open with
    // the hamburger menu still sitting open underneath it.
    setSidebarOpen(false)
  }

  async function handleCommuteSubmit() {
    setCommuteStatus('loading')
    setCommuteError(null)

    try {
      // Prefer whatever AddressAutocompleteInput already resolved (via
      // a picked prediction or blur) — falls back to a fresh geocode
      // only if the field was never blurred (e.g. Enter pressed while
      // still focused).
      const homeLocation = commuteHomeLocation ?? (await geocodeAddress(commuteHomeText))
      if (!homeLocation) {
        setCommuteError("Couldn't find that home address — double check it and try again.")
        setCommuteStatus('form')
        return
      }
      setCommuteHomeLocation(homeLocation)

      // No work address: fall back to "churches near home" rather than
      // a route, since there's nothing to draw a route between.
      let workLocation = null
      let routeCoordinates = null
      if (commuteWorkText.trim()) {
        workLocation = commuteWorkLocation ?? (await geocodeAddress(commuteWorkText))
        if (!workLocation) {
          setCommuteError("Couldn't find that work address — double check it and try again.")
          setCommuteStatus('form')
          return
        }
        setCommuteWorkLocation(workLocation)
        // Only used for the map polyline now — the detour baseline
        // below is computed from the Table API instead (see
        // tableDirectDurationSeconds), not this route's own duration.
        const directRoute = await fetchDrivingRoute([
          { lat: homeLocation.lat, lon: homeLocation.lon },
          { lat: workLocation.lat, lon: workLocation.lon },
        ])
        if (!directRoute) {
          setCommuteError("Couldn't find a driving route between those two addresses.")
          setCommuteStatus('form')
          return
        }
        routeCoordinates = directRoute.coordinates
      }

      const { data: churchRows, error: churchError } = await supabase
        .from('churches')
        .select('*')
        .or('ignore.eq.false,ignore.is.null')
      if (churchError || !churchRows) {
        setCommuteError('Something went wrong loading parish locations — try again.')
        setCommuteStatus('form')
        return
      }

      const churchPoints = churchRows.map((c) => ({ lat: c.latitude, lon: c.longitude }))

      // Rank by total drive time A -> church -> B, not just proximity
      // to the straight-line route: a church that's technically close
      // to the route but sits down a dead-end or across a river can
      // cost far more time than one that's a bit farther but naturally
      // on the way. With no work address there's no "B" leg, so it's
      // just drive time from home. Kept as the FULL sorted list (see
      // commuteRankedChurches above) — capping to MAX_RESULTS happens
      // later, per selected day, in buildMassOptionCards.
      //
      // When a work address is given, all four directions are needed —
      // not just home->church->work — because the leave-by/arrive-by
      // times shown for noon and evening Masses run the opposite way
      // (work->church, church->home), and OSRM's driving durations are
      // directional (a one-way street can make the reverse trip a
      // different length).
      let rankedChurches
      if (workLocation) {
        const homePoint = { lat: homeLocation.lat, lon: homeLocation.lon }
        const workPoint = { lat: workLocation.lat, lon: workLocation.lon }
        // homeToChurchAndWork tacks `work` on as one extra destination
        // on the same request as the home->church legs, specifically
        // so the direct home->work baseline used for detourSeconds
        // below comes from the SAME service (Table) as leg1/leg2 —
        // comparing a Table-derived total against a Route-derived
        // baseline was the original bug: OSRM's /route and /table
        // services use different underlying algorithms and don't
        // always agree on a duration for the identical road segment,
        // which was making genuine detours of several minutes come out
        // as ~0 after the Math.max(0, ...) clamp below, and "On the
        // Way" show up far more often than it should have.
        const [homeToChurchAndWork, churchToWork, workToChurch, churchToHome] = await Promise.all(
          [
            fetchDurationsMatrix([homePoint], [...churchPoints, workPoint]),
            fetchDurationsMatrix(churchPoints, [workPoint]),
            fetchDurationsMatrix([workPoint], churchPoints),
            fetchDurationsMatrix(churchPoints, [homePoint]),
          ]
        )
        if (!homeToChurchAndWork || !churchToWork || !workToChurch || !churchToHome) {
          setCommuteError('Something went wrong calculating drive times — try again.')
          setCommuteStatus('form')
          return
        }
        const homeToChurch = homeToChurchAndWork[0].slice(0, churchPoints.length)
        const tableDirectDurationSeconds = homeToChurchAndWork[0][churchPoints.length]
        if (tableDirectDurationSeconds == null) {
          setCommuteError("Couldn't find a driving route between those two addresses.")
          setCommuteStatus('form')
          return
        }
        rankedChurches = churchRows
          .map((church, i) => {
            const leg1Seconds = homeToChurch[i] // home -> church
            const leg2Seconds = churchToWork[i][0] // church -> work
            const leg3Seconds = workToChurch[0][i] // work -> church
            const leg4Seconds = churchToHome[i][0] // church -> home
            if ([leg1Seconds, leg2Seconds, leg3Seconds, leg4Seconds].some((s) => s == null)) {
              return null // no driving route in one of the four directions
            }
            return {
              church,
              totalSeconds: leg1Seconds + leg2Seconds, // still the A->church->B ranking metric
              // How much LONGER the trip gets by routing through this
              // church, vs. driving straight home->work — using the
              // Table-derived baseline above, not the Route API's.
              detourSeconds: Math.max(0, leg1Seconds + leg2Seconds - tableDirectDurationSeconds),
              leg1Seconds,
              leg2Seconds,
              leg3Seconds,
              leg4Seconds,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.totalSeconds - b.totalSeconds)
      } else {
        const homeToChurch = await fetchDurationsMatrix(
          [{ lat: homeLocation.lat, lon: homeLocation.lon }],
          churchPoints
        )
        if (!homeToChurch) {
          setCommuteError('Something went wrong calculating drive times — try again.')
          setCommuteStatus('form')
          return
        }
        rankedChurches = churchRows
          .map((church, i) => {
            const totalSeconds = homeToChurch[0][i]
            if (totalSeconds == null) return null
            return { church, totalSeconds, leg1Seconds: totalSeconds }
          })
          .filter(Boolean)
          .sort((a, b) => a.totalSeconds - b.totalSeconds)
      }

      const { data: massRows } = await supabase
        .from('mass_times')
        .select('id, church_id, day_of_week, time, notes, sunday_obligation')

      setCommuteMassTimes(groupMassTimesByChurch(massRows || []))
      setCommuteRankedChurches(rankedChurches)
      setCommuteRoute(routeCoordinates)
      focusRouteRequestIdRef.current++ // invalidate any in-flight focus-route fetch
      setCommuteFocusedRoute(null)
      setCommuteFocusedChurchId(null)
      setCommuteStatus('results')
    } catch {
      setCommuteError('Something went wrong finding mass times — try again.')
      setCommuteStatus('form')
    }
  }

  // Fetches an actual route through the clicked church — home->church
  // when there's no work address, home->church->work when there is —
  // and shows it in place of the general line. Triggered by clicking
  // a specific Mass time in CommuteResults.
  async function handleFocusChurchRoute(church) {
    if (!commuteHomeLocation) return // no route without at least home
    const requestId = ++focusRouteRequestIdRef.current
    const waypoints = [
      { lat: commuteHomeLocation.lat, lon: commuteHomeLocation.lon },
      { lat: church.latitude, lon: church.longitude },
    ]
    if (commuteWorkLocation) {
      waypoints.push({ lat: commuteWorkLocation.lat, lon: commuteWorkLocation.lon })
    }
    const route = await fetchDrivingRoute(waypoints)
    if (requestId !== focusRouteRequestIdRef.current) return // superseded by a later click
    if (!route) return // OSRM hiccup — leave the general route showing rather than clear it
    setCommuteFocusedRoute(route.coordinates)
    setCommuteFocusedChurchId(church.id)
  }

  // Changing days can change which options are even displayed, so a
  // previously focused church's route may no longer correspond to
  // anything on screen — clear it rather than leave a stale route drawn.
  function handleSelectCommuteDay(day) {
    focusRouteRequestIdRef.current++ // invalidate any in-flight focus-route fetch
    setCommuteFocusedRoute(null)
    setCommuteFocusedChurchId(null)
    setCommuteSelectedDay(day)
  }

  function handleCloseEvent() {
    setSelectedEvent(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  // Re-derived on every render (cheap at diocese scale — tens of
  // churches, not thousands) rather than stored in state, so switching
  // the selected day just recomputes which cards to show from data
  // already in memory. No network request involved.
  //
  // buildMassOptionCards still selects which 6 options make the list
  // by drive-time rank (closest churches first) — that part is
  // unchanged. `rankIndex` captures each card's position in that
  // drive-time order before the list below gets re-sorted for DISPLAY
  // by Mass time — CommuteResults uses rankIndex (not display
  // position) for the On the Way / Closer / Further badge, so the
  // badge still reflects commute proximity even though cards are shown
  // in time order.
  const commuteCards = buildMassOptionCards(
    commuteRankedChurches,
    commuteMassTimes,
    commuteSelectedDay,
    MAX_RESULTS
  ).map((card, rankIndex) => ({ ...card, rankIndex }))

  const commuteCardsByTime = [...commuteCards].sort((a, b) => {
    const aMinutes = parseTimeToMinutes(a.massTime.text) ?? 0
    const bMinutes = parseTimeToMinutes(b.massTime.text) ?? 0
    return aMinutes - bMinutes
  })

  return (
    <div className="app" data-theme={theme}>
      <header className="app__header" ref={headerRef}>
        <div>
          <h1>
            Daily Mass <span className="app__header-accent">Des Moines</span>
          </h1>
          <p>Give us this day our daily bread</p>
        </div>
        <button
          type="button"
          className="hamburger-button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      </header>

      <main className="app__main">
        <aside
          className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}
          aria-label="Upcoming events"
        >
          {commuteStatus === 'closed' ? (
            <>
              <button
                type="button"
                className="commute-button"
                onClick={() => setCommuteStatus('form')}
              >
                Add Daily Mass to your commute
              </button>

              <h2 className="sidebar__heading">Upcoming Events</h2>

              <div className="sidebar__events">
                <EventList
                  events={events}
                  loading={eventsLoading}
                  error={eventsError}
                  selectedEvent={selectedEvent}
                  onSelectEvent={handleSelectEvent}
                  onCloseEvent={handleCloseEvent}
                  theme={theme}
                />
              </div>

              <div className="sidebar__footer">
                <a className="staff-link" href="/admin">
                  Staff Login
                </a>
              </div>
            </>
          ) : commuteStatus === 'results' ? (
            <CommuteResults
              cardsByTime={commuteCardsByTime}
              cardsByLocation={commuteCards}
              hasRoute={Boolean(commuteRoute)}
              selectedDay={commuteSelectedDay}
              onSelectDay={handleSelectCommuteDay}
              onFocusRoute={handleFocusChurchRoute}
              focusedChurchId={commuteFocusedChurchId}
              onBack={() => setCommuteStatus('form')}
            />
          ) : (
            <CommuteForm
              onBack={() => setCommuteStatus('closed')}
              onSubmit={handleCommuteSubmit}
              loading={commuteStatus === 'loading'}
              error={commuteError}
              homeText={commuteHomeText}
              onHomeTextChange={setCommuteHomeText}
              homeLocation={commuteHomeLocation}
              onHomeLocationChange={setCommuteHomeLocation}
              workText={commuteWorkText}
              onWorkTextChange={setCommuteWorkText}
              workLocation={commuteWorkLocation}
              onWorkLocationChange={setCommuteWorkLocation}
              selectedDay={commuteSelectedDay}
              onSelectDay={setCommuteSelectedDay}
            />
          )}
        </aside>
        <section className="app__map" aria-label="Parish locations">
          <ChurchMap
            theme={theme}
            onToggleTheme={toggleTheme}
            selectedEvent={selectedEvent}
            route={commuteStatus === 'results' ? (commuteFocusedRoute ?? commuteRoute) : null}
            highlightedChurchIds={
              commuteStatus === 'results'
                ? [...new Set(commuteCards.map((c) => c.church.id))]
                : null
            }
            homeLocation={commuteStatus !== 'closed' ? commuteHomeLocation : null}
            workLocation={commuteStatus !== 'closed' ? commuteWorkLocation : null}
            mapCompact={sidebarOpen}
          />
        </section>
      </main>
    </div>
  )
}