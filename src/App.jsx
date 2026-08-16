import React, { useState, useMemo, useEffect, useContext, createContext } from "react";
import {
  Car, Bike, Truck, Bus, Mountain, Zap, MapPin, Star, ShieldCheck, ShieldOff,
  Phone, MessageCircle, X, Check, ChevronRight, ChevronLeft, Search,
  Users, Fuel, Settings2, Plane, BadgeCheck, Plus, ArrowRight,
  LayoutGrid, SlidersHorizontal, Camera, Inbox, TrendingUp, Compass,
  ArrowLeft, Lock, ImagePlus, Clock, AlertTriangle, Flag, Loader2, CreditCard, Info, Map, Scale
} from "lucide-react";

/* ---------------------------------- tokens ---------------------------------- */

const C = {
  void: "#122320",
  panel: "#1B322D",
  panelSoft: "#20392F",
  lagoon: "#2E9E86",
  lagoonDeep: "#1F7A68",
  coral: "#E56A3E",
  coralSoft: "#F0895E",
  hibiscus: "#D9527A",
  sand: "#F4EEDD",
  mist: "#EFE7D5",
  ink: "#17211E",
  inkSoft: "#4A5D57",
  line: "rgba(244,238,221,0.14)",
  lineDark: "rgba(17,33,29,0.10)",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
`;

const display = { fontFamily: "'Space Grotesk', sans-serif" };
const body = { fontFamily: "'Inter', sans-serif" };
const mono = { fontFamily: "'IBM Plex Mono', monospace" };

/* ---------------------------------- supabase ---------------------------------- */

// Fill these in from your Supabase project (Settings → API).
// The anon key is safe to ship in client code — your RLS policies are what
// actually protect the data, not secrecy of this key.
const SUPABASE_URL = "https://dokgjfraatfzdnzqftvy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e4Va8w2ihrstELS4uat06A_h3cxhwAR";
const SUPABASE_CONFIGURED = !SUPABASE_URL.includes("YOUR-PROJECT-REF");

// User IDs allowed to see the Admin nav item. This is UI-gating only —
// real enforcement happens server-side via the is_admin() check inside
// the approve_supplier/reject_supplier/list_pending_suppliers functions,
// so this list being wrong or tampered with client-side can't grant
// unauthorized access, only hide/show a button.
const ADMIN_USER_IDS = ["982df59c-6533-4e2f-910c-2b942dd9c62e"];

// Minimal fetch-based Supabase client (REST + Auth). This artifact environment
// can't install @supabase/supabase-js from npm, so we talk to the same REST
// and Auth HTTP endpoints the SDK itself uses under the hood.
function sbHeaders(accessToken) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbHandle(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || body.error_description || body.msg || JSON.stringify(body);
    } catch (e) {}
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbSelect(table, { select = "*", query = "", accessToken } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${query}`;
  return sbHandle(await fetch(url, { headers: sbHeaders(accessToken) }));
}

async function sbInsert(table, rows, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  return sbHandle(await fetch(url, {
    method: "POST",
    headers: { ...sbHeaders(accessToken), Prefer: "return=representation" },
    body: JSON.stringify(rows),
  }));
}

async function sbUpdate(table, query, patch, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  return sbHandle(await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders(accessToken), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  }));
}

async function sbRpc(fn, args, accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  return sbHandle(await fetch(url, {
    method: "POST",
    headers: sbHeaders(accessToken),
    body: JSON.stringify(args),
  }));
}

async function sbSignUp(email, password, fullName) {
  const url = `${SUPABASE_URL}/auth/v1/signup`;
  return sbHandle(await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  }));
}

async function sbSignIn(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  return sbHandle(await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
}

async function sbRefreshSession(refreshToken) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  return sbHandle(await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }));
}

const SESSION_STORAGE_KEY = "efate_rides_session";

function saveSessionToStorage(session) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch (e) {}
}

function loadSessionFromStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {}
  return null;
}

function clearSessionFromStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {}
}

/* ---------------------------------- i18n ---------------------------------- */

const LANGS = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

const STRINGS = {
  en: {
    header: { renter: "I'm renting", supplier: "I'm a supplier", verified: "ID verified" },
    auth: {
      signIn: "Sign in", signUp: "Sign up", signOut: "Sign out",
      email: "Email", password: "Password", fullName: "Full name",
      submitSignIn: "Sign in", submitSignUp: "Create account",
      switchToSignUp: "New here? Create an account", switchToSignIn: "Already have an account? Sign in",
      notConfigured: "Backend not connected yet — add your Supabase URL and key to enable real accounts.",
    },
    admin: {
      nav: "Admin",
      heading: "Supplier approvals",
      subheading: "{n} application(s) waiting for review",
      empty: "Nothing waiting — all caught up.",
      approve: "Approve", reject: "Reject",
      approved: "Approved", rejected: "Rejected — sent back to unverified",
      submittedOn: "Submitted {date}",
      loadError: "Couldn't load applications:",
      actionError: "Action failed:",
    },
    hero: {
      eyebrow: "PORT VILA · EFATE ISLAND",
      title: "Every vehicle on the island, one search.",
      sub: "Compare local suppliers, see the deposit terms up front, and book — you pay the supplier directly, no middleman on your card.",
      searchPlaceholder: "Search vehicles, suppliers, or areas...",
      search: "Search",
    },
    filters: {
      allTypes: "All types",
      noDeposit: "No deposit",
      sortRating: "Sort: Top rated",
      sortPriceLow: "Sort: Price, low to high",
      sortPriceHigh: "Sort: Price, high to low",
      noResults: "No vehicles match those filters yet.",
    },
    types: { car: "Car", "4x4": "4x4 / SUV", scooter: "Scooter", van: "Van / Minibus", quad: "Quad", ebike: "E-Bike" },
    card: { perDay: "VUV/day", deposit: "VUV deposit", noDeposit: "No deposit", airport: "Airport pickup" },
    detail: {
      seats: "Seats", transmission: "Transmission", fuel: "Fuel", airportPickup: "Airport pickup",
      available: "Available", notOffered: "Not offered",
      depositTitle: "{amount} VUV refundable deposit", noDepositTitle: "No deposit required",
      depositExplain: "Held by the supplier at pickup (cash or card hold) and refunded on return, minus any damage found in the joint condition check. Vanuatu rentals don't carry insurance — this deposit is the supplier's only cover.",
      noDepositExplain: "This supplier doesn't require a deposit. There is still no insurance on this rental — you're responsible for any damage during your hire.",
      photoNote: "At pickup and return, take timestamped photos of the vehicle in-app. It's your record if there's ever a dispute about the deposit.",
      paidDirect: "Paid directly to the supplier",
      quickId: "Quick ID check on first booking",
      requestToBook: "Request to book",
      reviews: "reviews",
    },
    map: {
      tapPin: "Tap a pin to see vehicles there",
      vehicleSingular: "vehicle", vehiclePlural: "vehicles", inArea: "in",
      unmappedNote: "in areas not yet on the map.",
    },
    compare: {
      add: "Compare", added: "Added to compare", full: "You can compare up to 3 at a time",
      barLabel: "{n} selected", openBtn: "Compare", clearAll: "Clear all",
      title: "Compare vehicles", remove: "Remove",
      price: "Price", deposit: "Deposit", seats: "Seats", transmission: "Transmission", fuel: "Fuel",
      airportPickup: "Airport pickup", rating: "Rating", area: "Pickup area",
      yes: "Yes", no: "No",
      bookThis: "Book this one",
      empty: "Add at least 2 vehicles from the list to compare them here.",
    },
    booking: {
      steps: ["Request", "Confirm", "Pickup", "Return", "Deposit back"],
      pickupDate: "Pickup date", returnDate: "Return date", continueBtn: "Continue",
      alreadyBooked: "Already booked:", conflictError: "Those dates overlap with an existing booking — try different dates.",
      noInsurance: "This rental has no insurance — Vanuatu rentals run on a {depositText} basis instead. You'll take handover photos in-app, and pay {supplier} directly by cash, bank transfer, or card.",
      depositBasis: "{amount} VUV refundable deposit", noDepositBasis: "no-deposit",
      agree: "I acknowledge the deposit terms and that this rental has no insurance cover.",
      sendRequest: "Send request",
      requestSent: "Request sent", reference: "Reference",
      supplierWillConfirm: "{supplier} will confirm availability and arrange payment directly with you.",
      whatsapp: "WhatsApp", call: "Call",
      conditionHeader: "VEHICLE CONDITION RECORD",
      pickupPhotos: "Pickup photos", returnPhotos: "Return photos",
      pickupDoneSub: "{total} photos logged", pickupPendingSub: "Take before you drive off · {done}/{total}",
      returnLockedSub: "Unlocks once pickup photos are logged",
      returnDoneSub: "{total} photos logged", returnPendingSub: "Take before handing the keys back · {done}/{total}",
      conditionFooter: "Photos are timestamped automatically and kept with this booking — your record if there's ever a deposit dispute.",
      done: "Done",
    },
    deposit: {
      header: "DEPOSIT REFUND TRACKER", none: "No deposit was held for this rental — nothing to refund.",
      tracking: "Tracking", overdue: "Overdue",
      overdueMsg: "This deposit is {duration} past the usual 48-hour refund window.",
      trackingMsg: "{supplier} usually refunds deposits within 48 hours. About {duration} left.",
      flag: "Flag this to Efate Rides", reported: "Reported — we'll follow up with {supplier} on your behalf.",
      demoNote: "Prototype only — fast-forward to preview states",
    },
    review: {
      header: "RATE YOUR EXPERIENCE", prompt: "How was renting from {supplier}?",
      commentPlaceholder: "Optional — tell future renters what to expect", submit: "Submit review",
      yourReview: "YOUR REVIEW", thanks: "Thanks — this helps future renters.",
    },
    checklist: {
      pickupTitle: "Pickup condition check", returnTitle: "Return condition check",
      logged: "{done}/{total} photos logged",
      items: { front: "Front of vehicle", back: "Rear of vehicle", left: "Left side", right: "Right side", interior: "Interior & seats", odometer: "Odometer / fuel gauge" },
      tapToCapture: "Tap to capture",
      notesLabel: "Existing damage or notes (optional)",
      notesPlaceholder: "e.g. small scratch on rear bumper, already there at pickup",
      saveIncomplete: "Capture all {total} photos to save",
      saveReady: "Save condition record",
    },
    id: {
      title: "Verify your license", subtitle: "One-time check so suppliers know you're good to drive — you won't need to do this again on this device.",
      fullName: "Full name (as on license)", licenseNumber: "License number", expiry: "Expiry date", country: "Issuing country",
      idpNote: "Since this license wasn't issued in Vanuatu, bring your International Driving Permit (IDP) too — suppliers may ask to see it alongside your license at pickup.",
      photoLabel: "Photo of your license", tapUpload: "Tap to capture or upload",
      verifyBtn: "Verify my license",
      privacy: "Your license photo is shared only with the supplier you book with, to confirm your identity at pickup.",
      checking: "Checking your details...",
      verifiedTitle: "You're verified", verifiedSub: "You won't need to do this again on this device. Let's get your booking sent.",
      continueBtn: "Continue to booking",
      expiredError: "This license appears to be expired — you'll need a valid, current license to book.",
    },
    dispute: {
      title: "Report an issue",
      whatIssue: "What's the issue?",
      categories: { depositNotRefunded: "Deposit not refunded", damageDisagreement: "Damage disagreement", notAsDescribed: "Vehicle not as described", other: "Other" },
      tellUs: "Tell us what happened",
      placeholder: "Add any details that will help us and the supplier sort this out...",
      photoNote: "Your {pickup}-photo pickup record and {return}-photo return record will be attached automatically.",
      submit: "Submit report",
      reportIssue: "Report an issue with this booking",
    },
    supplier: {
      dashboardLabel: "SUPPLIER DASHBOARD",
      welcomeBack: "Welcome back, {supplier}",
      justAdded: "{name} is live and pending verification — it'll show up for customers shortly.",
      activeListings: "Active listings", pendingRequests: "Pending requests", avgRating: "Avg. rating", monthlyBookings: "This month's bookings",
      bookingRequests: "Booking requests",
      rateGuest: "Rate this guest", ratedGuest: "You rated this guest",
      reviewsFromCustomers: "Reviews from customers",
      yourListings: "Your listings", addVehicle: "Add vehicle", pending: "Pending",
      serviceFeeLabel: "Service fee:", serviceFee: "Efate Rides invoices you 8% commission on confirmed bookings, monthly by bank transfer — you keep 100% of the direct payment from your customer.",
      statusPending: "pending", statusAccepted: "accepted", statusDeclined: "declined",
      openDisputes: "Reported issues", noDisputes: "No disputes — nothing to see here.",
      disputesHeading: "Disputes", disputesOpenCount: "{n} open",
      calendarHeading: "Availability calendar", selectVehicle: "Vehicle",
      legendAvailable: "Available", legendBlocked: "Blocked by you", legendBooked: "Booked by customer",
      calendarHint: "Tap a day to block it, tap again to unblock. Days booked by customers can't be changed here.",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      respondPlaceholder: "Write a response to the customer...", sendResponse: "Send response", responseSent: "Response sent to customer",
      statusOpen: "Open",
      resolve: "Mark resolved", resolved: "Resolved",
    },
    invoices: {
      heading: "Commission & invoices",
      outstanding: "Outstanding balance", nextDue: "Next due",
      periodThisMonth: "This month", periodLastMonth: "Last month", periodMonthsAgo: "{n} months ago",
      colPeriod: "Period", colBookings: "Bookings", colGross: "Gross bookings", colCommission: "Commission (8%)", colStatus: "Status",
      statusPaid: "Paid", statusDue: "Due", statusOverdue: "Overdue",
      paidOn: "Paid {date}", dueOn: "Due {date}",
      viewDetails: "View details", hideDetails: "Hide details",
      lineItemsHeading: "Bookings this period",
      colVehicle: "Vehicle", colCustomer: "Customer", colDates: "Dates", colAmount: "Amount",
      payNow: "Prototype only — mark as paid",
      empty: "No invoices yet — they'll appear here after your first confirmed bookings.",
    },
    addVehicle: {
      title: "List a new vehicle",
      vehicleName: "Vehicle name", vehicleNamePh: "e.g. Toyota RAV4",
      vehicleType: "Vehicle type",
      seats: "Seats", pickupArea: "Pickup area", transmission: "Transmission", fuel: "Fuel",
      offerAirport: "Offer airport pickup / delivery",
      continueBtn: "Continue",
      pricePerDay: "Price per day (VUV)",
      depositPolicy: "Deposit policy", noDeposit: "No deposit", depositRequired: "Deposit required",
      depositAmount: "Deposit amount (VUV, refundable)",
      photoNote: "Photo upload isn't wired up in this prototype yet — for now, vehicles get a colour-coded icon based on type.",
      reviewListing: "Review listing", publish: "Publish listing",
      previewNote: "This is how customers will see it. New listings are marked pending until you've completed verification.",
    },
    kyc: {
      gateTitle: "List your vehicles on Efate Rides",
      gateBody: "Reach every customer searching Efate rentals. A quick one-time verification, then you're live.",
      gateBullet1: "More visibility, no marketing spend",
      gateBullet2: "You keep control of pricing and deposit terms",
      gateBullet3: "Nothing upfront — pay only on confirmed bookings",
      startBtn: "Start verification",
      title: "Verify your business",
      subtitle: "A quick check so renters know you're a real, accountable supplier.",
      businessName: "Business / trading name", businessNamePh: "e.g. Vila 4x4 Rentals",
      contactName: "Contact person", contactNamePh: "e.g. Sarah Malantugun",
      phone: "Phone number", email: "Email address",
      businessType: "Business type", registered: "Registered business", individual: "Individual owner",
      regNumber: "Business registration number (if applicable)",
      area: "Main pickup area",
      continueBtn: "Continue",
      docsTitle: "Verification documents",
      idDocLabel: "Owner ID or business registration document",
      vehicleDocLabel: "Proof of vehicle registration for at least one vehicle",
      tapUpload: "Tap to capture or upload",
      agree: "I confirm this information is accurate and I have the right to rent out these vehicles.",
      reviewTitle: "Review your application",
      submitBtn: "Submit for review",
      submitting: "Submitting your application...",
      pendingTitle: "Application submitted",
      pendingBody: "We typically review new suppliers within 1–2 business days. We'll email you once you're approved and your listings go live.",
      pendingFor: "Application for",
      demoNote: "Prototype only — skip the wait to preview the approved dashboard.",
      simulateApproval: "Simulate approval",
      verifiedBadge: "Verified supplier",
    },
  },

  fr: {
    header: { renter: "Je loue", supplier: "Je suis loueur", verified: "Identité vérifiée" },
    auth: {
      signIn: "Se connecter", signUp: "S'inscrire", signOut: "Se déconnecter",
      email: "E-mail", password: "Mot de passe", fullName: "Nom complet",
      submitSignIn: "Se connecter", submitSignUp: "Créer un compte",
      switchToSignUp: "Nouveau ici ? Créer un compte", switchToSignIn: "Déjà un compte ? Se connecter",
      notConfigured: "Backend pas encore connecté — ajoutez votre URL et clé Supabase pour activer les vrais comptes.",
    },
    admin: {
      nav: "Admin",
      heading: "Validations des loueurs",
      subheading: "{n} demande(s) en attente de validation",
      empty: "Rien en attente — tout est à jour.",
      approve: "Approuver", reject: "Refuser",
      approved: "Approuvé", rejected: "Refusé — remis en statut non vérifié",
      submittedOn: "Envoyé le {date}",
      loadError: "Impossible de charger les demandes :",
      actionError: "Action échouée :",
    },
    hero: {
      eyebrow: "PORT-VILA · ÎLE D'EFATE",
      title: "Tous les véhicules de l'île, en une recherche.",
      sub: "Comparez les loueurs locaux, voyez la caution dès le départ, et réservez — vous payez le loueur directement, sans intermédiaire sur votre carte.",
      searchPlaceholder: "Rechercher un véhicule, un loueur, une zone...",
      search: "Rechercher",
    },
    filters: {
      allTypes: "Tous les types",
      noDeposit: "Sans caution",
      sortRating: "Trier : Mieux notés",
      sortPriceLow: "Trier : Prix croissant",
      sortPriceHigh: "Trier : Prix décroissant",
      noResults: "Aucun véhicule ne correspond à ces filtres pour l'instant.",
    },
    types: { car: "Voiture", "4x4": "4x4 / SUV", scooter: "Scooter", van: "Van / Minibus", quad: "Quad", ebike: "Vélo électrique" },
    card: { perDay: "VUV/jour", deposit: "VUV de caution", noDeposit: "Sans caution", airport: "Prise en charge à l'aéroport" },
    detail: {
      seats: "Places", transmission: "Transmission", fuel: "Carburant", airportPickup: "Prise en charge aéroport",
      available: "Disponible", notOffered: "Non proposé",
      depositTitle: "Caution remboursable de {amount} VUV", noDepositTitle: "Aucune caution requise",
      depositExplain: "Prélevée par le loueur au départ (espèces ou empreinte carte) et remboursée au retour, déduction faite des dommages constatés lors de l'état des lieux conjoint. Les locations au Vanuatu ne comprennent pas d'assurance — cette caution est la seule couverture du loueur.",
      noDepositExplain: "Ce loueur ne demande pas de caution. Cette location reste sans assurance — vous êtes responsable de tout dommage pendant la location.",
      photoNote: "Au départ et au retour, prenez des photos horodatées du véhicule dans l'application. C'est votre preuve en cas de litige sur la caution.",
      paidDirect: "Payé directement au loueur",
      quickId: "Vérification d'identité rapide à la première réservation",
      requestToBook: "Demander la réservation",
      reviews: "avis",
    },
    map: {
      tapPin: "Touchez un repère pour voir les véhicules disponibles",
      vehicleSingular: "véhicule", vehiclePlural: "véhicules", inArea: "à",
      unmappedNote: "véhicule(s) dans des zones pas encore sur la carte.",
    },
    compare: {
      add: "Comparer", added: "Ajouté à la comparaison", full: "Vous pouvez comparer jusqu'à 3 véhicules à la fois",
      barLabel: "{n} sélectionné(s)", openBtn: "Comparer", clearAll: "Tout effacer",
      title: "Comparer les véhicules", remove: "Retirer",
      price: "Prix", deposit: "Caution", seats: "Places", transmission: "Transmission", fuel: "Carburant",
      airportPickup: "Prise en charge aéroport", rating: "Note", area: "Zone de prise en charge",
      yes: "Oui", no: "Non",
      bookThis: "Réserver celui-ci",
      empty: "Ajoutez au moins 2 véhicules depuis la liste pour les comparer ici.",
    },
    booking: {
      steps: ["Demande", "Confirmation", "Départ", "Retour", "Caution rendue"],
      pickupDate: "Date de prise en charge", returnDate: "Date de retour", continueBtn: "Continuer",
      alreadyBooked: "Déjà réservé :", conflictError: "Ces dates chevauchent une réservation existante — essayez d'autres dates.",
      noInsurance: "Cette location n'inclut pas d'assurance — au Vanuatu, les locations fonctionnent avec {depositText} à la place. Vous prendrez des photos de remise en main propre dans l'application, et paierez {supplier} directement en espèces, par virement ou par carte.",
      depositBasis: "une caution remboursable de {amount} VUV", noDepositBasis: "aucune caution",
      agree: "Je reconnais les conditions de la caution et le fait que cette location ne comprend pas d'assurance.",
      sendRequest: "Envoyer la demande",
      requestSent: "Demande envoyée", reference: "Référence",
      supplierWillConfirm: "{supplier} confirmera la disponibilité et organisera le paiement directement avec vous.",
      whatsapp: "WhatsApp", call: "Appeler",
      conditionHeader: "ÉTAT DES LIEUX DU VÉHICULE",
      pickupPhotos: "Photos de départ", returnPhotos: "Photos de retour",
      pickupDoneSub: "{total} photos enregistrées", pickupPendingSub: "À prendre avant de partir · {done}/{total}",
      returnLockedSub: "Se débloque une fois les photos de départ enregistrées",
      returnDoneSub: "{total} photos enregistrées", returnPendingSub: "À prendre avant de rendre les clés · {done}/{total}",
      conditionFooter: "Les photos sont automatiquement horodatées et conservées avec cette réservation — votre preuve en cas de litige sur la caution.",
      done: "Terminé",
    },
    deposit: {
      header: "SUIVI DU REMBOURSEMENT DE CAUTION", none: "Aucune caution n'a été prélevée pour cette location — rien à rembourser.",
      tracking: "En cours", overdue: "En retard",
      overdueMsg: "Cette caution est en retard de {duration} par rapport au délai habituel de 48 heures.",
      trackingMsg: "{supplier} rembourse généralement les cautions sous 48 heures. Il reste environ {duration}.",
      flag: "Signaler à Efate Rides", reported: "Signalé — nous allons faire le suivi avec {supplier} pour vous.",
      demoNote: "Prototype uniquement — avancez le temps pour voir les différents états",
    },
    review: {
      header: "ÉVALUEZ VOTRE EXPÉRIENCE", prompt: "Comment s'est passée votre location chez {supplier} ?",
      commentPlaceholder: "Facultatif — dites aux futurs locataires à quoi s'attendre", submit: "Envoyer l'avis",
      yourReview: "VOTRE AVIS", thanks: "Merci — cela aide les futurs locataires.",
    },
    checklist: {
      pickupTitle: "État des lieux de départ", returnTitle: "État des lieux de retour",
      logged: "{done}/{total} photos enregistrées",
      items: { front: "Avant du véhicule", back: "Arrière du véhicule", left: "Côté gauche", right: "Côté droit", interior: "Intérieur & sièges", odometer: "Compteur / jauge de carburant" },
      tapToCapture: "Toucher pour prendre une photo",
      notesLabel: "Dommages existants ou remarques (facultatif)",
      notesPlaceholder: "ex. petite rayure à l'arrière, déjà présente au départ",
      saveIncomplete: "Prenez les {total} photos pour enregistrer",
      saveReady: "Enregistrer l'état des lieux",
    },
    id: {
      title: "Vérifiez votre permis", subtitle: "Vérification unique pour rassurer les loueurs — vous n'aurez plus à le refaire sur cet appareil.",
      fullName: "Nom complet (comme sur le permis)", licenseNumber: "Numéro de permis", expiry: "Date d'expiration", country: "Pays émetteur",
      idpNote: "Comme ce permis n'a pas été délivré au Vanuatu, apportez aussi votre Permis de Conduire International (PCI) — les loueurs peuvent le demander au départ.",
      photoLabel: "Photo de votre permis", tapUpload: "Toucher pour photographier ou importer",
      verifyBtn: "Vérifier mon permis",
      privacy: "La photo de votre permis n'est partagée qu'avec le loueur chez qui vous réservez, pour confirmer votre identité au départ.",
      checking: "Vérification en cours...",
      verifiedTitle: "Vous êtes vérifié", verifiedSub: "Vous n'aurez plus besoin de refaire cela sur cet appareil. Passons à votre réservation.",
      continueBtn: "Continuer la réservation",
      expiredError: "Ce permis semble expiré — un permis valide est nécessaire pour réserver.",
    },
    dispute: {
      title: "Signaler un problème",
      whatIssue: "Quel est le problème ?",
      categories: { depositNotRefunded: "Caution non remboursée", damageDisagreement: "Désaccord sur les dommages", notAsDescribed: "Véhicule non conforme à la description", other: "Autre" },
      tellUs: "Dites-nous ce qui s'est passé",
      placeholder: "Ajoutez les détails qui nous aideront, nous et le loueur, à régler cela...",
      photoNote: "Votre dossier photo de départ ({pickup} photos) et de retour ({return} photos) sera joint automatiquement.",
      submit: "Envoyer le signalement",
      reportIssue: "Signaler un problème avec cette réservation",
    },
    supplier: {
      dashboardLabel: "TABLEAU DE BORD LOUEUR",
      welcomeBack: "Bon retour, {supplier}",
      justAdded: "{name} est en ligne et en attente de vérification — il apparaîtra bientôt pour les clients.",
      activeListings: "Annonces actives", pendingRequests: "Demandes en attente", avgRating: "Note moyenne", monthlyBookings: "Réservations ce mois-ci",
      bookingRequests: "Demandes de réservation",
      rateGuest: "Évaluer ce client", ratedGuest: "Vous avez évalué ce client",
      reviewsFromCustomers: "Avis des clients",
      yourListings: "Vos annonces", addVehicle: "Ajouter un véhicule", pending: "En attente",
      serviceFeeLabel: "Frais de service :", serviceFee: "Efate Rides vous facture une commission de 8% sur les réservations confirmées, par virement mensuel — vous gardez 100% du paiement direct de votre client.",
      statusPending: "en attente", statusAccepted: "acceptée", statusDeclined: "refusée",
      openDisputes: "Problèmes signalés", noDisputes: "Aucun litige — rien à signaler ici.",
      disputesHeading: "Litiges", disputesOpenCount: "{n} en cours",
      calendarHeading: "Calendrier de disponibilité", selectVehicle: "Véhicule",
      legendAvailable: "Disponible", legendBlocked: "Bloqué par vous", legendBooked: "Réservé par un client",
      calendarHint: "Touchez un jour pour le bloquer, touchez à nouveau pour le débloquer. Les jours réservés par des clients ne peuvent pas être modifiés ici.",
      weekdays: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
      months: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
      respondPlaceholder: "Écrivez une réponse au client...", sendResponse: "Envoyer la réponse", responseSent: "Réponse envoyée au client",
      statusOpen: "En cours",
      resolve: "Marquer comme résolu", resolved: "Résolu",
    },
    invoices: {
      heading: "Commission et factures",
      outstanding: "Solde dû", nextDue: "Prochaine échéance",
      periodThisMonth: "Ce mois-ci", periodLastMonth: "Le mois dernier", periodMonthsAgo: "Il y a {n} mois",
      colPeriod: "Période", colBookings: "Réservations", colGross: "Réservations brutes", colCommission: "Commission (8%)", colStatus: "Statut",
      statusPaid: "Payée", statusDue: "Due", statusOverdue: "En retard",
      paidOn: "Payée le {date}", dueOn: "Échéance {date}",
      viewDetails: "Voir le détail", hideDetails: "Masquer le détail",
      lineItemsHeading: "Réservations de cette période",
      colVehicle: "Véhicule", colCustomer: "Client", colDates: "Dates", colAmount: "Montant",
      payNow: "Prototype uniquement — marquer comme payée",
      empty: "Aucune facture pour l'instant — elles apparaîtront ici après vos premières réservations confirmées.",
    },
    addVehicle: {
      title: "Ajouter un nouveau véhicule",
      vehicleName: "Nom du véhicule", vehicleNamePh: "ex. Toyota RAV4",
      vehicleType: "Type de véhicule",
      seats: "Places", pickupArea: "Zone de prise en charge", transmission: "Transmission", fuel: "Carburant",
      offerAirport: "Proposer la prise en charge / livraison à l'aéroport",
      continueBtn: "Continuer",
      pricePerDay: "Prix par jour (VUV)",
      depositPolicy: "Politique de caution", noDeposit: "Sans caution", depositRequired: "Caution requise",
      depositAmount: "Montant de la caution (VUV, remboursable)",
      photoNote: "L'ajout de photos n'est pas encore activé dans ce prototype — les véhicules reçoivent pour l'instant une icône colorée selon leur type.",
      reviewListing: "Vérifier l'annonce", publish: "Publier l'annonce",
      previewNote: "Voici comment les clients la verront. Les nouvelles annonces sont marquées en attente jusqu'à la vérification.",
    },
    kyc: {
      gateTitle: "Publiez vos véhicules sur Efate Rides",
      gateBody: "Touchez tous les clients qui cherchent une location sur Efate. Une vérification rapide, une seule fois, puis vous êtes en ligne.",
      gateBullet1: "Plus de visibilité, sans dépense marketing",
      gateBullet2: "Vous gardez le contrôle des prix et des conditions de caution",
      gateBullet3: "Rien à payer d'avance — seulement sur les réservations confirmées",
      startBtn: "Démarrer la vérification",
      title: "Vérifiez votre activité",
      subtitle: "Une vérification rapide pour que les clients sachent que vous êtes un loueur fiable et identifiable.",
      businessName: "Nom de l'entreprise / commercial", businessNamePh: "ex. Vila 4x4 Rentals",
      contactName: "Personne à contacter", contactNamePh: "ex. Sarah Malantugun",
      phone: "Numéro de téléphone", email: "Adresse e-mail",
      businessType: "Type d'activité", registered: "Entreprise enregistrée", individual: "Propriétaire individuel",
      regNumber: "Numéro d'enregistrement de l'entreprise (le cas échéant)",
      area: "Zone de prise en charge principale",
      continueBtn: "Continuer",
      docsTitle: "Documents de vérification",
      idDocLabel: "Pièce d'identité du propriétaire ou document d'enregistrement de l'entreprise",
      vehicleDocLabel: "Justificatif d'immatriculation pour au moins un véhicule",
      tapUpload: "Touchez pour capturer ou importer",
      agree: "Je confirme que ces informations sont exactes et que j'ai le droit de louer ces véhicules.",
      reviewTitle: "Vérifiez votre demande",
      submitBtn: "Soumettre pour vérification",
      submitting: "Envoi de votre demande...",
      pendingTitle: "Demande envoyée",
      pendingBody: "Nous examinons généralement les nouveaux loueurs sous 1 à 2 jours ouvrés. Vous recevrez un e-mail dès l'approbation, et vos annonces seront alors mises en ligne.",
      pendingFor: "Demande pour",
      demoNote: "Prototype uniquement — ignorez l'attente pour prévisualiser le tableau de bord approuvé.",
      simulateApproval: "Simuler l'approbation",
      verifiedBadge: "Loueur vérifié",
    },
  },
};

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function interpolate(str, vars) {
  if (typeof str !== "string" || !vars) return str;
  return Object.keys(vars).reduce((s, k) => s.split(`{${k}}`).join(vars[k]), str);
}

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (path) => path });

function useLang() {
  return useContext(LangContext);
}

function LangProvider({ children }) {
  const [lang, setLang] = useState("en");
  const t = (path, vars) => {
    const val = getPath(STRINGS[lang], path);
    const fallback = val === undefined ? getPath(STRINGS.en, path) : val;
    return interpolate(fallback, vars);
  };
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full" style={{ backgroundColor: C.panel }}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className="px-2 py-1 rounded-full text-[10px]"
          style={{ ...mono, fontWeight: 600, backgroundColor: lang === l.code ? C.coral : "transparent", color: lang === l.code ? "#fff" : C.mist }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}


/* ---------------------------------- data ---------------------------------- */

const TYPE_META = {
  car: { label: "Car", icon: Car, color: C.lagoon },
  "4x4": { label: "4x4 / SUV", icon: Truck, color: C.coral },
  scooter: { label: "Scooter", icon: Bike, color: C.hibiscus },
  van: { label: "Van / Minibus", icon: Bus, color: "#C9A227" },
  quad: { label: "Quad", icon: Mountain, color: "#8B5E3C" },
  ebike: { label: "E-Bike", icon: Zap, color: "#4C86C9" },
};

// Approximate positions on the stylized island outline used by MapView (viewBox 0 0 500 320)
const AREA_COORDS = {
  "Port Vila": { x: 300, y: 110 },
  "Erakor": { x: 320, y: 165 },
  "Mele": { x: 235, y: 175 },
  "Havannah Harbour": { x: 175, y: 100 },
};

const VEHICLES = [
  { id: 1, name: "Toyota RAV4", type: "4x4", supplier: "Vila 4x4 Rentals", verified: true, rating: 4.8, reviews: 62, price: 8500, deposit: 20000, seats: 5, trans: "Auto", fuel: "Petrol", airport: true, phone: "+678 5551 021", area: "Port Vila" },
  { id: 2, name: "Suzuki Jimny", type: "4x4", supplier: "Island Hopper Rentals", verified: true, rating: 4.6, reviews: 34, price: 7000, deposit: 15000, seats: 4, trans: "Manual", fuel: "Petrol", airport: false, area: "Port Vila" },
  { id: 3, name: "Honda 125cc Scooter", type: "scooter", supplier: "Vila Scooter Co", verified: true, rating: 4.5, reviews: 51, price: 3000, deposit: 0, seats: 2, trans: "Auto", fuel: "Petrol", airport: false, area: "Port Vila" },
  { id: 4, name: "Toyota Hiace (10-seat)", type: "van", supplier: "Efate Group Tours", verified: true, rating: 4.9, reviews: 28, price: 15000, deposit: 30000, seats: 10, trans: "Manual", fuel: "Diesel", airport: true, area: "Port Vila" },
  { id: 5, name: "Nissan X-Trail", type: "car", supplier: "Blue Lagoon Rentals", verified: false, rating: 4.7, reviews: 19, price: 9000, deposit: 0, seats: 5, trans: "Auto", fuel: "Petrol", airport: true, area: "Erakor" },
  { id: 6, name: "Yamaha Scooter", type: "scooter", supplier: "Port Vila Bike Hire", verified: false, rating: 4.4, reviews: 22, price: 2800, deposit: 0, seats: 1, trans: "Auto", fuel: "Petrol", airport: false, area: "Port Vila" },
  { id: 7, name: "Yamaha Grizzly 350 Quad", type: "quad", supplier: "Efate Quad Adventures", verified: true, rating: 4.7, reviews: 18, price: 9500, deposit: 20000, seats: 1, trans: "Auto", fuel: "Petrol", airport: false, area: "Mele" },
  { id: 9, name: "RadRunner E-Bike", type: "ebike", supplier: "Vila E-Bike Hire", verified: false, rating: 4.6, reviews: 29, price: 3500, deposit: 0, seats: 1, trans: "Auto", fuel: "Electric", airport: false, area: "Port Vila" },
  { id: 8, name: "Mitsubishi Pajero", type: "4x4", supplier: "Efate 4x4 Adventures", verified: true, rating: 4.8, reviews: 41, price: 10000, deposit: 25000, seats: 7, trans: "Auto", fuel: "Diesel", airport: true, area: "Havannah Harbour" },
];

// Mock existing bookings per vehicle, used to simulate real availability conflicts.
// Dates are generated relative to "today" so the demo stays realistic regardless of when it's viewed.
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const INITIAL_BOOKINGS = [
  { id: "bk1", vehicleId: 1, from: daysFromNow(2), to: daysFromNow(5), source: "customer" },
  { id: "bk2", vehicleId: 1, from: daysFromNow(10), to: daysFromNow(12), source: "customer" },
  { id: "bk3", vehicleId: 2, from: daysFromNow(1), to: daysFromNow(3), source: "customer" },
  { id: "bk4", vehicleId: 4, from: daysFromNow(6), to: daysFromNow(9), source: "customer" },
  { id: "bk5", vehicleId: 8, from: daysFromNow(4), to: daysFromNow(7), source: "customer" },
];

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function getUnavailableRanges(bookings, vehicleId) {
  return bookings.filter((b) => b.vehicleId === vehicleId);
}

function isRangeAvailable(bookings, vehicleId, from, to) {
  if (!from || !to) return true;
  return !bookings.some((b) => b.vehicleId === vehicleId && rangesOverlap(from, to, b.from, b.to));
}

/* ---------------------------------- auth ---------------------------------- */

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  // Session is persisted to localStorage (refresh token + access token) so a
  // real deployed visitor stays signed in across page reloads. On mount, we
  // try to restore + refresh any saved session. This safely no-ops inside the
  // Claude.ai artifact sandbox, where localStorage isn't available.
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    const saved = loadSessionFromStorage();
    if (!saved || !saved.refresh_token) {
      setRestoringSession(false);
      return;
    }
    sbRefreshSession(saved.refresh_token)
      .then((data) => {
        const next = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
        setSession(next);
        saveSessionToStorage(next);
      })
      .catch(() => clearSessionFromStorage())
      .finally(() => setRestoringSession(false));
  }, []);

  const signUp = async (email, password, fullName) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await sbSignUp(email, password, fullName);
      if (data.access_token) {
        const next = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
        setSession(next);
        saveSessionToStorage(next);
      }
      return data;
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const signIn = async (email, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await sbSignIn(email, password);
      const next = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
      setSession(next);
      saveSessionToStorage(next);
      return data;
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = () => {
    setSession(null);
    clearSessionFromStorage();
  };

  return (
    <AuthContext.Provider value={{
      session, user: session ? session.user : null,
      accessToken: session ? session.access_token : null,
      signUp, signIn, signOut, authLoading, authError, setAuthError, restoringSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function AuthModal({ onClose }) {
  const { t } = useLang();
  const { signUp, signIn, authLoading, authError, setAuthError } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const submit = async () => {
    try {
      if (mode === "signup") await signUp(email, password, fullName);
      else await signIn(email, password);
      onClose();
    } catch (e) {
      // error already captured in authError
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.7)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-4">
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>
            {mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
          </span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>

        {!SUPABASE_CONFIGURED && (
          <div className="rounded-lg px-3 py-2.5 mb-3.5" style={{ backgroundColor: "rgba(229,106,62,0.15)" }}>
            <span style={{ ...body, fontSize: 11.5, color: C.coralSoft }}>{t("auth.notConfigured")}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <FieldLabel>{t("auth.fullName")}</FieldLabel>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
            </div>
          )}
          <div>
            <FieldLabel>{t("auth.email")}</FieldLabel>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>{t("auth.password")}</FieldLabel>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
          </div>

          {authError && (
            <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
              <span style={{ ...body, fontSize: 11.5, color: C.hibiscus }}>{authError}</span>
            </div>
          )}

          <button
            disabled={authLoading || !email || !password || (mode === "signup" && !fullName)}
            onClick={submit}
            className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
            style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
          >
            {authLoading ? <Loader2 size={15} className="animate-spin" /> : (mode === "signin" ? t("auth.submitSignIn") : t("auth.submitSignUp"))}
          </button>

          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setAuthError(""); }}
            className="text-center"
            style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.7 }}
          >
            {mode === "signin" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
          </button>
        </div>
      </div>
    </div>
  );
}

const BookingsContext = createContext(null);

function useBookings() {
  return useContext(BookingsContext);
}

function BookingsProvider({ children }) {
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);

  const blockDate = (vehicleId, dateStr) => {
    setBookings((prev) => [...prev, { id: "blk-" + Math.random().toString(36).slice(2, 8), vehicleId, from: dateStr, to: dateStr, source: "supplier" }]);
  };
  const unblockDate = (id) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <BookingsContext.Provider value={{ bookings, blockDate, unblockDate }}>
      {children}
    </BookingsContext.Provider>
  );
}

/* ---------------------------------- supplier KYC ---------------------------------- */

const SupplierAuthContext = createContext(null);

function useSupplierAuth() {
  return useContext(SupplierAuthContext);
}

function SupplierAuthProvider({ children }) {
  const { user, accessToken } = useAuth();
  const [status, setStatus] = useState("unverified"); // unverified | pending | verified
  const [profile, setProfile] = useState(null);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [applyError, setApplyError] = useState("");

  // When a real user is signed in and Supabase is configured, check whether
  // they already have a supplier record — this makes refresh-safe within a
  // session (still resets across browser reloads since we don't persist the
  // auth session itself, same limitation as everywhere else in this prototype).
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !user) {
      setStatus("unverified");
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoadingSupplier(true);
    sbSelect("suppliers", { query: `&user_id=eq.${user.id}`, accessToken })
      .then((rows) => {
        if (cancelled) return;
        if (rows && rows[0]) {
          setProfile(rows[0]);
          setStatus(rows[0].kyc_status);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingSupplier(false));
    return () => { cancelled = true; };
  }, [user, accessToken]);

  const submitApplication = async (data) => {
    setApplyError("");
    if (SUPABASE_CONFIGURED && user) {
      try {
        const rows = await sbInsert("suppliers", [{
          user_id: user.id,
          business_name: data.businessName,
          business_type: data.businessType,
          contact_name: data.contactName,
          phone: data.phone,
          email: data.email,
          years_operating: data.years ? Number(data.years) : null,
          registration_number: data.idNumber || null,
          submitted_at: new Date().toISOString(),
          kyc_status: "pending",
        }], accessToken);
        setProfile(rows[0]);
        setStatus(rows[0].kyc_status);
      } catch (e) {
        setApplyError(e.message);
      }
      return;
    }
    // Fallback demo behavior when Supabase isn't configured or no one's signed in.
    setProfile(data);
    setStatus("pending");
  };

  // Real KYC approval is an admin/service-role action, blocked from the client
  // by RLS on purpose — same as it should be in production. This attempts the
  // real update (which will correctly fail) so the security boundary is visible,
  // rather than faking success.
  const simulateApproval = async () => {
    if (SUPABASE_CONFIGURED && user && profile) {
      try {
        await sbUpdate("suppliers", `id=eq.${profile.id}`, { kyc_status: "verified" }, accessToken);
        setStatus("verified");
      } catch (e) {
        setApplyError("Blocked as expected — clients can't self-approve. Run the SQL below as an admin to approve this test supplier.");
      }
      return;
    }
    setStatus("verified");
  };

  return (
    <SupplierAuthContext.Provider value={{ status, profile, submitApplication, simulateApproval, loadingSupplier, applyError }}>
      {children}
    </SupplierAuthContext.Provider>
  );
}

/* ---------------------------------- small bits ---------------------------------- */

function fmtVUV(n) {
  return n === 0 ? "0" : n.toLocaleString("en-US");
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DepositGauge({ amount, size = 34 }) {
  const required = amount > 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = required ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth="3" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={required ? C.coral : C.lagoon} strokeWidth="3"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {required ? (
        <ShieldCheck x={size / 2 - 7} y={size / 2 - 7} width={14} height={14} color={C.coral} />
      ) : (
        <ShieldOff x={size / 2 - 7} y={size / 2 - 7} width={14} height={14} color={C.lagoon} />
      )}
    </svg>
  );
}

function Pill({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-full text-sm transition-colors"
      style={{
        ...body,
        border: `1px solid ${active ? "transparent" : C.line}`,
        backgroundColor: active ? C.lagoon : "transparent",
        color: active ? "#fff" : C.mist,
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StarRatingInput({ value, onChange, size = 20 }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => onChange(n)}>
          <Star size={size} color={C.coral} fill={(hover || value) >= n ? C.coral : "none"} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating, size = 12 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={C.coral} fill={rating >= n ? C.coral : "none"} strokeWidth={1.5} />
      ))}
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: C.panelSoft }}>
        <Icon size={18} color={C.coralSoft} />
      </div>
      <div>
        <div className="text-xl" style={{ ...display, color: C.sand, fontWeight: 700 }}>{value}</div>
        <div className="text-xs" style={{ ...body, color: C.mist, opacity: 0.7 }}>{label}</div>
      </div>
    </div>
  );
}

/* ---------------------------------- header ---------------------------------- */

function Header({ mode, setMode, idVerified, onOpenAuth }) {
  const { t } = useLang();
  const { user, signOut, restoringSession } = useAuth();
  return (
    <div className="flex items-center justify-between px-5 md:px-10 py-4 sticky top-0 z-30" style={{ backgroundColor: C.void, borderBottom: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.coral }}>
          <Compass size={17} color="#fff" />
        </div>
        <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>Efate Rides</span>
        {mode === "renter" && idVerified && (
          <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full ml-1" style={{ backgroundColor: "rgba(46,158,134,0.15)" }}>
            <BadgeCheck size={11} color={C.lagoon} />
            <span style={{ ...body, fontSize: 10, fontWeight: 600, color: C.lagoon }}>{t("header.verified")}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <div className="flex items-center gap-1 p-1 rounded-full" style={{ backgroundColor: C.panel }}>
          <button
            onClick={() => setMode("renter")}
            className="px-4 py-1.5 rounded-full text-sm"
            style={{ ...body, fontWeight: 500, backgroundColor: mode === "renter" ? C.lagoon : "transparent", color: mode === "renter" ? "#fff" : C.mist }}
          >
            {t("header.renter")}
          </button>
          <button
            onClick={() => setMode("supplier")}
            className="px-4 py-1.5 rounded-full text-sm"
            style={{ ...body, fontWeight: 500, backgroundColor: mode === "supplier" ? C.lagoon : "transparent", color: mode === "supplier" ? "#fff" : C.mist }}
          >
            {t("header.supplier")}
          </button>
          {user && ADMIN_USER_IDS.includes(user.id) && (
            <button
              onClick={() => setMode("admin")}
              className="px-4 py-1.5 rounded-full text-sm"
              style={{ ...body, fontWeight: 500, backgroundColor: mode === "admin" ? C.coral : "transparent", color: mode === "admin" ? "#fff" : C.mist }}
            >
              {t("admin.nav")}
            </button>
          )}
        </div>
        {restoringSession ? (
          <div className="w-16 h-7 rounded-full" style={{ backgroundColor: C.panel }} />
        ) : user ? (
          <button onClick={signOut} className="px-3 py-1.5 rounded-full text-xs" style={{ ...body, fontWeight: 500, color: C.mist, border: `1px solid ${C.line}` }}>
            {t("auth.signOut")}
          </button>
        ) : (
          <button onClick={onOpenAuth} className="px-3 py-1.5 rounded-full text-xs" style={{ ...body, fontWeight: 600, backgroundColor: C.panel, color: C.sand, border: `1px solid ${C.line}` }}>
            {t("auth.signIn")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- hero (ring-road motif) ---------------------------------- */

function Hero({ query, setQuery }) {
  const { t } = useLang();
  const hubs = [
    { x: 190, y: 70, label: "Airport" },
    { x: 300, y: 60, label: "Port Vila" },
    { x: 360, y: 150, label: "Erakor" },
    { x: 260, y: 210, label: "Havannah" },
    { x: 120, y: 160, label: "Mele" },
  ];
  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: C.void }}>
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <svg viewBox="0 0 460 260" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="240" cy="140" rx="190" ry="105" fill="none" stroke={C.lagoon} strokeWidth="1.5" strokeDasharray="3 7" />
          {hubs.map((h, i) => (
            <g key={i}>
              <circle cx={h.x} cy={h.y} r="4" fill={C.coral} />
            </g>
          ))}
        </svg>
      </div>
      <div className="relative max-w-5xl mx-auto px-5 md:px-10 pt-14 pb-10 md:pt-20 md:pb-14">
        <div className="text-xs mb-3" style={{ ...mono, color: C.coralSoft, letterSpacing: "0.08em" }}>{t("hero.eyebrow")}</div>
        <h1 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: "clamp(28px, 5vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em", maxWidth: 620 }}>
          {t("hero.title")}
        </h1>
        <p className="mt-3 max-w-md" style={{ ...body, color: C.mist, opacity: 0.75, fontSize: 15, lineHeight: 1.6 }}>
          {t("hero.sub")}
        </p>

        <div className="mt-7 rounded-2xl p-2.5 flex flex-col md:flex-row gap-2" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 flex-1 px-3 py-2">
            <Search size={16} color={C.mist} style={{ opacity: 0.6 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hero.searchPlaceholder")}
              className="bg-transparent outline-none w-full text-sm"
              style={{ ...body, color: C.sand }}
            />
          </div>
          <button
            className="px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
            style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
          >
            {t("hero.search")} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- filters ---------------------------------- */

function Filters({ type, setType, deposit, setDeposit, sort, setSort, view, setView }) {
  const { t } = useLang();
  const depositActive = deposit === "none";
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={type === "all"} onClick={() => setType("all")}>{t("filters.allTypes")}</Pill>
        {Object.entries(TYPE_META).map(([key, m]) => {
          const active = type === key;
          return (
            <button
              key={key}
              onClick={() => setType(active ? "all" : key)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-colors"
              style={{
                ...body, fontWeight: 500,
                backgroundColor: active ? m.color : "transparent",
                border: `1px solid ${active ? "transparent" : C.line}`,
                color: active ? "#fff" : C.mist,
              }}
            >
              {!active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />}
              {t(`types.${key}`)}
            </button>
          );
        })}
        <button
          onClick={() => setDeposit(depositActive ? "all" : "none")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-colors"
          style={{
            ...body, fontWeight: 500,
            backgroundColor: depositActive ? "rgba(229,106,62,0.14)" : "transparent",
            border: `1px solid ${depositActive ? C.coral : C.line}`,
            color: depositActive ? C.coralSoft : C.mist,
          }}
        >
          <ShieldCheck size={13} />
          {t("filters.noDeposit")}
        </button>
      </div>

      <div className="flex items-center justify-end gap-2.5 mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
        <button
          onClick={() => setView("list")}
          className="w-7 h-7 rounded-full flex items-center justify-center"
        >
          <LayoutGrid size={14} color={view === "list" ? C.lagoon : C.mist} style={{ opacity: view === "list" ? 1 : 0.5 }} />
        </button>
        <button
          onClick={() => setView("map")}
          className="w-7 h-7 rounded-full flex items-center justify-center"
        >
          <Map size={14} color={view === "map" ? C.lagoon : C.mist} style={{ opacity: view === "map" ? 1 : 0.5 }} />
        </button>
        <span className="w-px h-3.5" style={{ backgroundColor: C.line }} />
        <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ ...mono, color: C.mist, opacity: 0.7 }}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-transparent outline-none"
            style={{ ...mono, color: C.mist }}
          >
            <option style={{ color: C.ink }} value="rating">{t("filters.sortRating")}</option>
            <option style={{ color: C.ink }} value="priceLow">{t("filters.sortPriceLow")}</option>
            <option style={{ color: C.ink }} value="priceHigh">{t("filters.sortPriceHigh")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- vehicle card ---------------------------------- */

function VehicleCard({ v, onSelect, compareIds, onToggleCompare }) {
  const { t } = useLang();
  const meta = TYPE_META[v.type];
  const Icon = meta.icon;
  const inCompare = compareIds && compareIds.includes(v.id);
  return (
    <div
      onClick={() => onSelect(v)}
      role="button"
      tabIndex={0}
      className="text-left rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5 cursor-pointer"
      style={{ backgroundColor: C.sand, border: `1px solid ${inCompare ? C.lagoon : C.lineDark}` }}
    >
      <div className="h-32 flex items-center justify-center relative" style={{ backgroundColor: meta.color }}>
        <Icon size={44} color="rgba(255,255,255,0.92)" strokeWidth={1.5} />
        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          {onToggleCompare && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCompare(v.id); }}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: inCompare ? C.coral : "rgba(0,0,0,0.35)", border: inCompare ? "none" : "1.5px solid rgba(255,255,255,0.6)" }}
              title={t("compare.add")}
            >
              {inCompare ? <Check size={12} color="#fff" /> : <Scale size={11} color="#fff" />}
            </button>
          )}
          {v.airport && (
            <div className="px-2 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
              <Plane size={11} color="#fff" />
              <span style={{ ...body, fontSize: 10, color: "#fff", fontWeight: 500 }}>{t("card.airport")}</span>
            </div>
          )}
        </div>
        <div className="absolute top-2.5 right-2.5">
          <DepositGauge amount={v.deposit} />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div style={{ ...display, color: C.ink, fontWeight: 700, fontSize: 16 }}>{v.name}</div>
            <div className="flex items-center gap-1 mt-0.5" style={{ ...body, fontSize: 12.5, color: C.inkSoft }}>
              {v.supplier}
              {v.verified && <BadgeCheck size={13} color={C.lagoonDeep} />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2.5 text-xs" style={{ ...body, color: C.inkSoft }}>
          <span className="flex items-center gap-1"><Star size={12} color={C.coral} fill={C.coral} /> {v.rating}</span>
          <span className="flex items-center gap-1"><Users size={12} /> {v.seats}</span>
          <span className="flex items-center gap-1"><Settings2 size={12} /> {v.trans}</span>
        </div>
        <div className="flex items-end justify-between mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${C.lineDark}` }}>
          <div>
            <span style={{ ...mono, fontSize: 17, fontWeight: 500, color: C.ink }}>{fmtVUV(v.price)}</span>
            <span style={{ ...body, fontSize: 11.5, color: C.inkSoft }}> {t("card.perDay")}</span>
          </div>
          <div style={{ ...body, fontSize: 11, color: v.deposit ? C.coral : C.lagoonDeep, fontWeight: 500 }}>
            {v.deposit ? `${fmtVUV(v.deposit)} ${t("card.deposit")}` : t("card.noDeposit")}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- vehicle detail ---------------------------------- */

function MapView({ vehicles, onSelect, compareIds, onToggleCompare }) {
  const { t } = useLang();
  const [activeArea, setActiveArea] = useState(null);

  const groups = useMemo(() => {
    const g = {};
    vehicles.forEach((v) => {
      if (!AREA_COORDS[v.area]) return;
      g[v.area] = g[v.area] || [];
      g[v.area].push(v);
    });
    return g;
  }, [vehicles]);

  const areas = Object.keys(groups);
  const unmapped = vehicles.filter((v) => !AREA_COORDS[v.area]);

  return (
    <div>
      <div className="rounded-2xl overflow-hidden relative" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <svg viewBox="0 0 500 320" className="w-full" style={{ height: 340 }}>
          <ellipse cx="260" cy="150" rx="210" ry="120" fill="none" stroke={C.line} strokeWidth="1.5" strokeDasharray="3 7" />
          <ellipse cx="260" cy="150" rx="150" ry="85" fill="rgba(46,158,134,0.05)" stroke="none" />
          {areas.map((area) => {
            const pos = AREA_COORDS[area];
            const count = groups[area].length;
            const active = activeArea === area;
            return (
              <g key={area} transform={`translate(${pos.x},${pos.y})`} onClick={() => setActiveArea(active ? null : area)} style={{ cursor: "pointer" }}>
                <circle r={active ? 20 : 16} fill={active ? C.coral : C.lagoon} opacity={active ? 1 : 0.85} />
                <text y="4" textAnchor="middle" style={{ ...mono, fontSize: 12, fontWeight: 600, fill: "#fff" }}>{count}</text>
                <text y="34" textAnchor="middle" style={{ ...body, fontSize: 11, fontWeight: 600, fill: C.sand }}>{area}</text>
              </g>
            );
          })}
        </svg>
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(9,17,15,0.55)" }}>
          <MapPin size={11} color={C.mist} />
          <span style={{ ...body, fontSize: 10.5, color: C.mist }}>{t("map.tapPin")}</span>
        </div>
      </div>

      {activeArea && groups[activeArea] && (
        <div className="mt-4">
          <div style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 10 }}>
            {groups[activeArea].length} {groups[activeArea].length > 1 ? t("map.vehiclePlural") : t("map.vehicleSingular")} {t("map.inArea")} <b style={{ color: C.sand }}>{activeArea}</b>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups[activeArea].map((v) => (
              <VehicleCard key={v.id} v={v} onSelect={onSelect} compareIds={compareIds} onToggleCompare={onToggleCompare} />
            ))}
          </div>
        </div>
      )}

      {unmapped.length > 0 && (
        <p style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.5, marginTop: 12 }}>
          {unmapped.length} {unmapped.length > 1 ? t("map.vehiclePlural") : t("map.vehicleSingular")} {t("map.unmappedNote")}
        </p>
      )}
    </div>
  );
}

function VehicleDetail({ v, onClose, onBook, idVerified }) {
  const { t } = useLang();
  const meta = TYPE_META[v.type];
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ backgroundColor: "rgba(9,17,15,0.6)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:w-[440px] h-full overflow-y-auto"
        style={{ backgroundColor: C.sand }}
      >
        <div className="h-44 flex items-center justify-center relative" style={{ backgroundColor: meta.color }}>
          <Icon size={64} color="rgba(255,255,255,0.92)" strokeWidth={1.4} />
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <div className="p-6">
          <div style={{ ...mono, fontSize: 11, color: C.inkSoft, letterSpacing: "0.06em" }}>{t(`types.${v.type}`).toUpperCase()}</div>
          <h2 style={{ ...display, fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 4 }}>{v.name}</h2>
          <div className="flex items-center gap-2 mt-2" style={{ ...body, fontSize: 13.5, color: C.inkSoft }}>
            <span className="flex items-center gap-1">{v.supplier} {v.verified && <BadgeCheck size={14} color={C.lagoonDeep} />}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><MapPin size={12} /> {v.area}</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5" style={{ ...body, fontSize: 13, color: C.inkSoft }}>
            <Star size={13} color={C.coral} fill={C.coral} /> {v.rating} ({v.reviews} {t("detail.reviews")})
          </div>

          <div className="grid grid-cols-2 gap-2.5 mt-5">
            {[
              { label: t("detail.seats"), value: v.seats, icon: Users },
              { label: t("detail.transmission"), value: v.trans, icon: Settings2 },
              { label: t("detail.fuel"), value: v.fuel, icon: Fuel },
              { label: t("detail.airportPickup"), value: v.airport ? t("detail.available") : t("detail.notOffered"), icon: Plane },
            ].map((f, i) => (
              <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "#fff", border: `1px solid ${C.lineDark}` }}>
                <f.icon size={14} color={C.inkSoft} />
                <div style={{ ...body, fontSize: 13, color: C.ink, fontWeight: 500, marginTop: 6 }}>{f.value}</div>
                <div style={{ ...body, fontSize: 10.5, color: C.inkSoft }}>{f.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4 mt-4" style={{ backgroundColor: v.deposit ? "#FBEDE5" : "#E9F4EF", border: `1px solid ${v.deposit ? "#EAC7B4" : "#BFE2D3"}` }}>
            <div className="flex items-center gap-2">
              {v.deposit ? <ShieldCheck size={16} color={C.coral} /> : <ShieldOff size={16} color={C.lagoonDeep} />}
              <span style={{ ...body, fontWeight: 600, fontSize: 13.5, color: C.ink }}>
                {v.deposit ? t("detail.depositTitle", { amount: fmtVUV(v.deposit) }) : t("detail.noDepositTitle")}
              </span>
            </div>
            <p style={{ ...body, fontSize: 12, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
              {v.deposit ? t("detail.depositExplain") : t("detail.noDepositExplain")}
            </p>
          </div>

          <div className="rounded-xl p-4 mt-3 flex items-start gap-2.5" style={{ backgroundColor: "#fff", border: `1px solid ${C.lineDark}` }}>
            <Camera size={16} color={C.inkSoft} className="mt-0.5 shrink-0" />
            <p style={{ ...body, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
              {t("detail.photoNote")}
            </p>
          </div>

          <div className="mt-6 pt-5 flex items-end justify-between" style={{ borderTop: `1px solid ${C.lineDark}` }}>
            <div>
              <span style={{ ...mono, fontSize: 22, fontWeight: 500, color: C.ink }}>{fmtVUV(v.price)}</span>
              <span style={{ ...body, fontSize: 12, color: C.inkSoft }}> {t("card.perDay").replace("/", " / ")}</span>
              <div style={{ ...body, fontSize: 10.5, color: C.inkSoft, marginTop: 2 }}>{t("detail.paidDirect")}</div>
              {!idVerified && (
                <div className="flex items-center gap-1 mt-1.5" style={{ ...body, fontSize: 10.5, color: C.inkSoft }}>
                  <CreditCard size={11} /> {t("detail.quickId")}
                </div>
              )}
            </div>
            <button
              onClick={() => onBook(v)}
              className="px-5 py-2.5 rounded-xl text-sm flex items-center gap-1.5"
              style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
            >
              {t("detail.requestToBook")} <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- comparison ---------------------------------- */

function ComparisonModal({ vehicles, onClose, onRemove, onBook }) {
  const { t } = useLang();

  const rows = [
    { label: t("compare.price"), render: (v) => `${fmtVUV(v.price)} ${t("card.perDay")}` },
    { label: t("compare.deposit"), render: (v) => (v.deposit ? `${fmtVUV(v.deposit)} ${t("card.deposit")}` : t("card.noDeposit")) },
    { label: t("compare.seats"), render: (v) => v.seats },
    { label: t("compare.transmission"), render: (v) => v.trans },
    { label: t("compare.fuel"), render: (v) => v.fuel },
    { label: t("compare.airportPickup"), render: (v) => (v.airport ? t("compare.yes") : t("compare.no")) },
    { label: t("compare.rating"), render: (v) => `${v.rating} ★` },
    { label: t("compare.area"), render: (v) => v.area },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.7)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{t("compare.title")}</span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>

        <div className="overflow-auto p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: `120px repeat(${vehicles.length}, minmax(140px, 1fr))` }}>
            <div />
            {vehicles.map((v) => {
              const meta = TYPE_META[v.type];
              const Icon = meta.icon;
              return (
                <div key={v.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: C.sand }}>
                  <div className="h-20 flex items-center justify-center relative" style={{ backgroundColor: meta.color }}>
                    <Icon size={30} color="rgba(255,255,255,0.92)" strokeWidth={1.5} />
                    <button
                      onClick={() => onRemove(v.id)}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                      title={t("compare.remove")}
                    >
                      <X size={11} color="#fff" />
                    </button>
                  </div>
                  <div className="p-2.5">
                    <div style={{ ...body, fontWeight: 700, fontSize: 12.5, color: C.ink, lineHeight: 1.3 }}>{v.name}</div>
                    <div style={{ ...body, fontSize: 10.5, color: C.inkSoft, marginTop: 2 }}>{v.supplier}</div>
                  </div>
                </div>
              );
            })}

            {rows.map((row, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center" style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.7 }}>{row.label}</div>
                {vehicles.map((v) => (
                  <div key={v.id} className="flex items-center px-2 py-2 rounded-lg" style={{ backgroundColor: C.panelSoft, ...mono, fontSize: 12, color: C.sand }}>
                    {row.render(v)}
                  </div>
                ))}
              </React.Fragment>
            ))}

            <div />
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => onBook(v)}
                className="mt-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
              >
                {t("compare.bookThis")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- booking flow ---------------------------------- */

function StepTrack({ step }) {
  const { t } = useLang();
  const steps = t("booking.steps");
  return (
    <div className="flex items-center mb-6">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-1.5" style={{ width: 60 }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
              style={{
                ...mono,
                backgroundColor: i <= step ? C.coral : "transparent",
                border: `1.5px solid ${i <= step ? C.coral : C.line}`,
                color: i <= step ? "#fff" : C.mist,
              }}
            >
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <span className="text-center" style={{ ...body, fontSize: 9.5, color: C.mist, opacity: i <= step ? 1 : 0.5, lineHeight: 1.2 }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px -mt-4" style={{ backgroundColor: i < step ? C.coral : C.line }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

const CHECK_ITEMS = [
  { id: "front", label: "Front of vehicle" },
  { id: "back", label: "Rear of vehicle" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
  { id: "interior", label: "Interior & seats" },
  { id: "odometer", label: "Odometer / fuel gauge" },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ConditionChecklist({ mode, vehicleName, initialPhotos, onClose, onSave }) {
  const { t } = useLang();
  const [photos, setPhotos] = useState(initialPhotos || {});
  const [note, setNote] = useState("");
  const done = Object.keys(photos).length;
  const total = CHECK_ITEMS.length;
  const itemLabels = t("checklist.items");

  const capture = async (id, file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotos((p) => ({ ...p, [id]: { dataUrl, time: new Date() } }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.75)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>
            {mode === "pickup" ? t("checklist.pickupTitle") : t("checklist.returnTitle")}
          </span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>
        <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 4 }}>
          {vehicleName} · {t("checklist.logged", { done, total })}
        </p>
        <div className="h-1.5 rounded-full mt-2 mb-5" style={{ backgroundColor: C.void }}>
          <div className="h-1.5 rounded-full" style={{ width: `${(done / total) * 100}%`, backgroundColor: C.coral, transition: "width 0.25s ease" }} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {CHECK_ITEMS.map((item) => {
            const shot = photos[item.id];
            const label = itemLabels[item.id] || item.label;
            return (
              <label
                key={item.id}
                className="rounded-xl overflow-hidden cursor-pointer relative flex flex-col"
                style={{ backgroundColor: C.void, border: `1px solid ${shot ? C.lagoon : C.line}` }}
              >
                <input
                  type="file" accept="image/*" capture="environment"
                  className="hidden"
                  onChange={(e) => capture(item.id, e.target.files && e.target.files[0])}
                />
                <div className="aspect-square flex items-center justify-center relative">
                  {shot ? (
                    <img src={shot.dataUrl} alt={label} className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus size={22} color={C.mist} style={{ opacity: 0.5 }} />
                  )}
                  {shot && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: C.lagoon }}>
                      <Check size={11} color="#fff" />
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5" style={{ backgroundColor: C.panelSoft }}>
                  <div style={{ ...body, fontSize: 10.5, color: C.sand, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
                  <div style={{ ...mono, fontSize: 8.5, color: C.mist, opacity: 0.6, marginTop: 1 }}>
                    {shot ? shot.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : t("checklist.tapToCapture")}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-4">
          <FieldLabel>{t("checklist.notesLabel")}</FieldLabel>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t("checklist.notesPlaceholder")}
            rows={2}
            className="w-full px-3 py-2 rounded-lg outline-none resize-none"
            style={{ ...inputStyle, fontSize: 12.5 }}
          />
        </div>

        <button
          disabled={done < total}
          onClick={() => onSave(photos)}
          className="w-full mt-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ ...body, fontWeight: 600, backgroundColor: C.lagoon, color: "#fff" }}
        >
          <Check size={15} /> {done < total ? t("checklist.saveIncomplete", { total }) : t("checklist.saveReady")}
        </button>
      </div>
    </div>
  );
}

function fmtDuration(ms) {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function DepositTracker({ deposit, returnTime, supplier, dispute, onFlagIssue }) {
  const { t } = useLang();
  const [demoHours, setDemoHours] = useState(0);
  const windowHours = 48;

  const deadline = new Date(returnTime.getTime() + windowHours * 3600000);
  const effectiveNow = new Date(Date.now() + demoHours * 3600000);
  const remainingMs = deadline - effectiveNow;
  const overdue = remainingMs < 0;
  const elapsedMs = effectiveNow - returnTime;
  const pct = Math.min(100, Math.max(0, (elapsedMs / (windowHours * 3600000)) * 100));

  return (
    <div className="mt-6 pt-5 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
      <div style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, fontWeight: 600, marginBottom: 10 }}>
        {t("deposit.header")}
      </div>

      {deposit === 0 ? (
        <div className="rounded-xl p-3.5 flex items-center gap-2.5" style={{ backgroundColor: C.panelSoft }}>
          <ShieldOff size={16} color={C.lagoon} />
          <span style={{ ...body, fontSize: 12.5, color: C.mist }}>{t("deposit.none")}</span>
        </div>
      ) : (
        <div className="rounded-xl p-4" style={{ backgroundColor: overdue ? "#3A1E1E" : C.panelSoft, border: `1px solid ${overdue ? C.hibiscus : C.line}` }}>
          <div className="flex items-center justify-between">
            <span style={{ ...mono, fontSize: 17, color: C.sand }}>{fmtVUV(deposit)} VUV</span>
            {overdue ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(217,82,122,0.2)" }}>
                <AlertTriangle size={11} color={C.hibiscus} />
                <span style={{ ...body, fontSize: 10, fontWeight: 600, color: C.hibiscus }}>{t("deposit.overdue")}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(46,158,134,0.18)" }}>
                <Clock size={11} color={C.lagoon} />
                <span style={{ ...body, fontSize: 10, fontWeight: 600, color: C.lagoon }}>{t("deposit.tracking")}</span>
              </span>
            )}
          </div>

          <div className="h-1.5 rounded-full mt-3" style={{ backgroundColor: C.void }}>
            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: overdue ? C.hibiscus : C.lagoon, transition: "width 0.25s ease" }} />
          </div>

          <p style={{ ...body, fontSize: 12, color: C.mist, marginTop: 8, lineHeight: 1.5 }}>
            {overdue
              ? t("deposit.overdueMsg", { duration: fmtDuration(remainingMs) })
              : t("deposit.trackingMsg", { supplier, duration: fmtDuration(remainingMs) })}
          </p>

          {overdue && !dispute && (
            <button onClick={onFlagIssue}
              className="w-full mt-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
              style={{ ...body, fontWeight: 600, backgroundColor: C.hibiscus, color: "#fff" }}>
              <Flag size={13} /> {t("deposit.flag")}
            </button>
          )}
          {dispute && (
            <div className="mt-3 rounded-lg p-2.5" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
              <div className="flex items-center gap-1.5">
                <Check size={13} color={C.lagoon} />
                <span style={{ ...body, fontSize: 11.5, color: C.mist }}>{t("deposit.reported", { supplier })} ({dispute.id})</span>
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: `1px dashed ${C.line}` }}>
            <span style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.5 }}>{t("deposit.demoNote")}</span>
            <div className="flex gap-1">
              <button onClick={() => setDemoHours((h) => h + 24)} className="px-2 py-1 rounded text-[10px]" style={{ ...body, color: C.mist, border: `1px solid ${C.line}` }}>+24h</button>
              <button onClick={() => setDemoHours(0)} className="px-2 py-1 rounded text-[10px]" style={{ ...body, color: C.mist, border: `1px solid ${C.line}` }}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DISPUTE_CATEGORIES = ["Deposit not refunded", "Damage disagreement", "Vehicle not as described", "Other"];
const DISPUTE_CATEGORY_KEYS = { "Deposit not refunded": "depositNotRefunded", "Damage disagreement": "damageDisagreement", "Vehicle not as described": "notAsDescribed", "Other": "other" };

function DisputeModal({ vehicleName, supplier, pickupCount, returnCount, onClose, onSubmit }) {
  const { t } = useLang();
  const [category, setCategory] = useState(DISPUTE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const categoryLabels = t("dispute.categories");

  const submit = () => {
    onSubmit({
      id: "DSP-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      category,
      description: description.trim(),
      time: new Date(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.75)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{t("dispute.title")}</span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>
        <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 16 }}>{vehicleName} · {supplier}</p>

        <FieldLabel>{t("dispute.whatIssue")}</FieldLabel>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {DISPUTE_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)}
              className="px-3 py-1.5 rounded-full text-xs"
              style={{ ...body, fontWeight: 500, backgroundColor: category === cat ? C.hibiscus : "transparent", color: category === cat ? "#fff" : C.mist, border: `1px solid ${category === cat ? "transparent" : C.line}` }}>
              {categoryLabels[DISPUTE_CATEGORY_KEYS[cat]] || cat}
            </button>
          ))}
        </div>

        <FieldLabel>{t("dispute.tellUs")}</FieldLabel>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t("dispute.placeholder")}
          rows={4}
          className="w-full px-3 py-2 rounded-lg outline-none resize-none"
          style={{ ...inputStyle, fontSize: 12.5 }}
        />

        <div className="rounded-xl p-3 mt-3 flex items-center gap-2.5" style={{ backgroundColor: C.panelSoft }}>
          <Camera size={14} color={C.mist} style={{ opacity: 0.7 }} className="shrink-0" />
          <p style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.8, lineHeight: 1.4 }}>
            {t("dispute.photoNote", { pickup: pickupCount, return: returnCount })}
          </p>
        </div>

        <button
          disabled={!description.trim()}
          onClick={submit}
          className="w-full mt-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ ...body, fontWeight: 600, backgroundColor: C.hibiscus, color: "#fff" }}
        >
          <Flag size={14} /> {t("dispute.submit")}
        </button>
      </div>
    </div>
  );
}

function CustomerReview({ supplier, onSubmit }) {
  const { t } = useLang();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <div className="mt-6 pt-5 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
      <div style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, fontWeight: 600, marginBottom: 10 }}>
        {t("review.header")}
      </div>
      <div className="rounded-xl p-4" style={{ backgroundColor: C.panelSoft }}>
        <p style={{ ...body, fontSize: 12.5, color: C.sand, marginBottom: 10 }}>{t("review.prompt", { supplier })}</p>
        <StarRatingInput value={rating} onChange={setRating} size={22} />
        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={t("review.commentPlaceholder")}
          rows={2}
          className="w-full mt-3 px-3 py-2 rounded-lg outline-none resize-none"
          style={{ ...inputStyle, fontSize: 12.5 }}
        />
        <button
          disabled={!rating}
          onClick={() => onSubmit({ rating, comment })}
          className="w-full mt-3 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
        >
          {t("review.submit")}
        </button>
      </div>
    </div>
  );
}

function BookingModal({ v, onClose }) {
  const { t } = useLang();
  const { bookings } = useBookings();
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [dates, setDates] = useState({ from: "", to: "" });
  const [checklist, setChecklist] = useState({ pickup: null, return: null });
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [review, setReview] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const ref = useMemo(() => "EFR-" + Math.random().toString(36).slice(2, 8).toUpperCase(), []);
  const waMsg = encodeURIComponent(`Hi ${v.supplier}, I'd like to book the ${v.name} (ref ${ref}) via Efate Rides.`);
  const pickupDone = checklist.pickup && Object.keys(checklist.pickup).length === CHECK_ITEMS.length;
  const returnDone = checklist.return && Object.keys(checklist.return).length === CHECK_ITEMS.length;
  const returnTime = returnDone
    ? new Date(Math.max(...Object.values(checklist.return).map((p) => p.time.getTime())))
    : null;
  const unavailableRanges = useMemo(() => getUnavailableRanges(bookings, v.id), [bookings, v.id]);
  const hasConflict = dates.from && dates.to && !isRangeAvailable(bookings, v.id, dates.from, dates.to);

  const closeChecklist = (mode, photos) => {
    setChecklist((c) => ({ ...c, [mode]: photos }));
    setActiveChecklist(null);
    if (mode === "pickup" && Object.keys(photos).length === CHECK_ITEMS.length && step < 3) setStep(3);
    if (mode === "return" && Object.keys(photos).length === CHECK_ITEMS.length && step < 4) setStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.65)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-5">
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{v.name}</span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>

        <StepTrack step={step} />

        {step === 0 && (
          <div>
            <label style={{ ...body, fontSize: 12, color: C.mist }}>{t("booking.pickupDate")}</label>
            <input type="date" min={daysFromNow(0)} value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })}
              className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ ...body, backgroundColor: C.void, color: C.sand, border: `1px solid ${C.line}` }} />
            <label style={{ ...body, fontSize: 12, color: C.mist }}>{t("booking.returnDate")}</label>
            <input type="date" min={dates.from || daysFromNow(0)} value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ ...body, backgroundColor: C.void, color: C.sand, border: `1px solid ${C.line}` }} />

            {unavailableRanges.length > 0 && (
              <div className="rounded-lg px-3 py-2.5 mt-3" style={{ backgroundColor: C.panelSoft }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock size={11} color={C.mist} style={{ opacity: 0.6 }} />
                  <span style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.65, fontWeight: 600 }}>{t("booking.alreadyBooked")}</span>
                </div>
                <div style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.8, lineHeight: 1.6 }}>
                  {unavailableRanges.map((r, i) => (
                    <span key={i}>{fmtDateShort(r.from)} – {fmtDateShort(r.to)}{i < unavailableRanges.length - 1 ? ", " : ""}</span>
                  ))}
                </div>
              </div>
            )}

            {hasConflict && (
              <div className="rounded-lg px-3 py-2 mt-3" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
                <span style={{ ...body, fontSize: 11.5, color: C.hibiscus }}>{t("booking.conflictError")}</span>
              </div>
            )}

            <button
              disabled={!dates.from || !dates.to || hasConflict}
              onClick={() => setStep(1)}
              className="w-full mt-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
            >
              {t("booking.continueBtn")} <ArrowRight size={14} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="rounded-xl p-3.5 mb-3" style={{ backgroundColor: C.panelSoft }}>
              <p style={{ ...body, fontSize: 12.5, color: C.mist, lineHeight: 1.6 }}>
                {t("booking.noInsurance", {
                  depositText: v.deposit ? t("booking.depositBasis", { amount: fmtVUV(v.deposit) }) : t("booking.noDepositBasis"),
                  supplier: v.supplier,
                })}
              </p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span style={{ ...body, fontSize: 12.5, color: C.sand, lineHeight: 1.5 }}>
                {t("booking.agree")}
              </span>
            </label>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setStep(0)} className="w-11 h-10 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                <ChevronLeft size={16} color={C.mist} />
              </button>
              <button
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
              >
                {t("booking.sendRequest")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step >= 2 && (
          <div className="text-center py-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: C.lagoon }}>
              <Check size={22} color="#fff" />
            </div>
            <p style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 17, marginTop: 12 }}>{t("booking.requestSent")}</p>
            <p style={{ ...mono, color: C.coralSoft, fontSize: 12.5, marginTop: 4 }}>{t("booking.reference")} {ref}</p>
            <p style={{ ...body, color: C.mist, fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
              {t("booking.supplierWillConfirm", { supplier: v.supplier })}
            </p>
            <div className="flex gap-2 mt-5">
              <a href={`https://wa.me/6785551021?text=${waMsg}`} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
                style={{ ...body, fontWeight: 600, backgroundColor: "#25D366", color: "#fff" }}>
                <MessageCircle size={15} /> {t("booking.whatsapp")}
              </a>
              <a href="tel:+6785551021"
                className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
                style={{ ...body, fontWeight: 600, backgroundColor: C.panelSoft, color: C.sand, border: `1px solid ${C.line}` }}>
                <Phone size={15} /> {t("booking.call")}
              </a>
            </div>

            <div className="mt-6 pt-5 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
              <div style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, fontWeight: 600, marginBottom: 10 }}>
                {t("booking.conditionHeader")}
              </div>

              <button
                onClick={() => setActiveChecklist("pickup")}
                className="w-full rounded-xl p-3.5 flex items-center gap-3 mb-2.5"
                style={{ backgroundColor: C.panelSoft, border: `1px solid ${C.line}` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: pickupDone ? "rgba(46,158,134,0.2)" : "rgba(244,238,221,0.08)" }}>
                  {pickupDone ? <Check size={16} color={C.lagoon} /> : <Camera size={16} color={C.mist} />}
                </div>
                <div className="flex-1 text-left">
                  <div style={{ ...body, fontSize: 13, fontWeight: 600, color: C.sand }}>{t("booking.pickupPhotos")}</div>
                  <div style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.65 }}>
                    {pickupDone
                      ? t("booking.pickupDoneSub", { total: CHECK_ITEMS.length })
                      : t("booking.pickupPendingSub", { done: checklist.pickup ? Object.keys(checklist.pickup).length : 0, total: CHECK_ITEMS.length })}
                  </div>
                </div>
                <ChevronRight size={15} color={C.mist} style={{ opacity: 0.5 }} />
              </button>

              <button
                onClick={() => pickupDone && setActiveChecklist("return")}
                disabled={!pickupDone}
                className="w-full rounded-xl p-3.5 flex items-center gap-3 disabled:opacity-45"
                style={{ backgroundColor: C.panelSoft, border: `1px solid ${C.line}` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: returnDone ? "rgba(46,158,134,0.2)" : "rgba(244,238,221,0.08)" }}>
                  {returnDone ? <Check size={16} color={C.lagoon} /> : !pickupDone ? <Lock size={14} color={C.mist} /> : <Camera size={16} color={C.mist} />}
                </div>
                <div className="flex-1 text-left">
                  <div style={{ ...body, fontSize: 13, fontWeight: 600, color: C.sand }}>{t("booking.returnPhotos")}</div>
                  <div style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.65 }}>
                    {!pickupDone
                      ? t("booking.returnLockedSub")
                      : returnDone
                        ? t("booking.returnDoneSub", { total: CHECK_ITEMS.length })
                        : t("booking.returnPendingSub", { done: checklist.return ? Object.keys(checklist.return).length : 0, total: CHECK_ITEMS.length })}
                  </div>
                </div>
                {pickupDone && <ChevronRight size={15} color={C.mist} style={{ opacity: 0.5 }} />}
              </button>

              <p style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.6, marginTop: 10, lineHeight: 1.5 }}>
                {t("booking.conditionFooter")}
              </p>
            </div>

            {returnDone && <DepositTracker deposit={v.deposit} returnTime={returnTime} supplier={v.supplier} dispute={dispute} onFlagIssue={() => setDisputeModalOpen(true)} />}

            {returnDone && (
              review ? (
                <div className="mt-6 pt-5 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, fontWeight: 600, marginBottom: 10 }}>
                    {t("review.yourReview")}
                  </div>
                  <div className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: C.panelSoft }}>
                    <StarDisplay rating={review.rating} size={14} />
                    <div className="flex-1">
                      {review.comment && (
                        <p style={{ ...body, fontSize: 12, color: C.mist, marginTop: 4, lineHeight: 1.5 }}>{review.comment}</p>
                      )}
                      <p style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.5, marginTop: 6 }}>{t("review.thanks")}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <CustomerReview supplier={v.supplier} onSubmit={setReview} />
              )
            )}

            {!dispute && (
              <button onClick={() => setDisputeModalOpen(true)} className="w-full mt-4 flex items-center justify-center gap-1.5 py-1.5 text-[11px]" style={{ ...body, color: C.mist, opacity: 0.5 }}>
                <Flag size={11} /> {t("dispute.reportIssue")}
              </button>
            )}

            <button onClick={onClose} className="w-full mt-2 py-2 text-xs" style={{ ...body, color: C.mist, opacity: 0.6 }}>
              {t("booking.done")}
            </button>
          </div>
        )}
      </div>

      {activeChecklist && (
        <ConditionChecklist
          mode={activeChecklist}
          vehicleName={v.name}
          initialPhotos={checklist[activeChecklist] || {}}
          onClose={() => setActiveChecklist(null)}
          onSave={(photos) => closeChecklist(activeChecklist, photos)}
        />
      )}

      {disputeModalOpen && (
        <DisputeModal
          vehicleName={v.name}
          supplier={v.supplier}
          pickupCount={checklist.pickup ? Object.keys(checklist.pickup).length : 0}
          returnCount={checklist.return ? Object.keys(checklist.return).length : 0}
          onClose={() => setDisputeModalOpen(false)}
          onSubmit={(d) => { setDispute(d); setDisputeModalOpen(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- add vehicle flow ---------------------------------- */

function FieldLabel({ children }) {
  return <label style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, display: "block", marginBottom: 5 }}>{children}</label>;
}

const inputStyle = {
  ...body,
  backgroundColor: C.void,
  color: C.sand,
  border: `1px solid ${C.line}`,
  fontSize: 13.5,
};

/* ---------------------------------- id verification ---------------------------------- */

const LICENSE_COUNTRIES = ["Vanuatu", "Australia", "New Zealand", "France", "United Kingdom", "United States", "Other"];

function IDVerificationModal({ onClose, onVerified }) {
  const { t } = useLang();
  const [stage, setStage] = useState("form"); // form | checking | done
  const [form, setForm] = useState({ fullName: "", licenseNumber: "", country: "Vanuatu", expiry: "", photo: null });
  const [error, setError] = useState("");
  const set = (k, v) => setForm({ ...form, [k]: v });

  const needsIDP = form.country !== "Vanuatu" && form.country !== "";
  const valid = form.fullName.trim() && form.licenseNumber.trim() && form.expiry && form.photo;

  const handlePhoto = async (file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    set("photo", dataUrl);
  };

  const submit = () => {
    if (new Date(form.expiry) < new Date()) {
      setError(t("id.expiredError"));
      return;
    }
    setError("");
    setStage("checking");
    setTimeout(() => setStage("done"), 1400);
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.75)" }} onClick={stage === "form" ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>

        {stage === "form" && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{t("id.title")}</span>
              <button onClick={onClose}><X size={18} color={C.mist} /></button>
            </div>
            <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
              {t("id.subtitle")}
            </p>

            <div className="flex flex-col gap-3.5">
              <div>
                <FieldLabel>{t("id.fullName")}</FieldLabel>
                <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Sarah Malantugun"
                  className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>{t("id.licenseNumber")}</FieldLabel>
                  <input value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} placeholder="e.g. VU10293"
                    className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                </div>
                <div>
                  <FieldLabel>{t("id.expiry")}</FieldLabel>
                  <input type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                </div>
              </div>
              <div>
                <FieldLabel>{t("id.country")}</FieldLabel>
                <select value={form.country} onChange={(e) => set("country", e.target.value)} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle}>
                  {LICENSE_COUNTRIES.map((c) => (
                    <option key={c} style={{ color: C.ink }}>{c}</option>
                  ))}
                </select>
              </div>

              {needsIDP && (
                <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: C.panelSoft }}>
                  <Info size={14} color={C.coralSoft} className="mt-0.5 shrink-0" />
                  <p style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.85, lineHeight: 1.5 }}>
                    {t("id.idpNote")}
                  </p>
                </div>
              )}

              <div>
                <FieldLabel>{t("id.photoLabel")}</FieldLabel>
                <label
                  className="rounded-xl overflow-hidden cursor-pointer flex flex-col items-center justify-center relative"
                  style={{ backgroundColor: C.void, border: `1px solid ${form.photo ? C.lagoon : C.line}`, height: 110 }}
                >
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => handlePhoto(e.target.files && e.target.files[0])} />
                  {form.photo ? (
                    <>
                      <img src={form.photo} alt="License" className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: C.lagoon }}>
                        <Check size={11} color="#fff" />
                      </div>
                    </>
                  ) : (
                    <>
                      <CreditCard size={22} color={C.mist} style={{ opacity: 0.5 }} />
                      <span style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.6, marginTop: 6 }}>{t("id.tapUpload")}</span>
                    </>
                  )}
                </label>
              </div>

              {error && (
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
                  <span style={{ ...body, fontSize: 11.5, color: C.hibiscus }}>{error}</span>
                </div>
              )}

              <button
                disabled={!valid}
                onClick={submit}
                className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 mt-1"
                style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
              >
                {t("id.verifyBtn")} <ArrowRight size={14} />
              </button>
              <p style={{ ...body, fontSize: 10, color: C.mist, opacity: 0.5, textAlign: "center", lineHeight: 1.5 }}>
                {t("id.privacy")}
              </p>
            </div>
          </>
        )}

        {stage === "checking" && (
          <div className="text-center py-8">
            <Loader2 size={28} color={C.coral} className="mx-auto animate-spin" />
            <p style={{ ...body, fontSize: 13, color: C.mist, marginTop: 14 }}>{t("id.checking")}</p>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: C.lagoon }}>
              <Check size={22} color="#fff" />
            </div>
            <p style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 17, marginTop: 12 }}>{t("id.verifiedTitle")}</p>
            <p style={{ ...body, color: C.mist, fontSize: 12.5, marginTop: 6, lineHeight: 1.6, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
              {t("id.verifiedSub")}
            </p>
            <button
              onClick={() => onVerified(form)}
              className="w-full mt-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
              style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
            >
              {t("id.continueBtn")} <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddVehicleModal({ onClose, onAdd }) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", type: "car", seats: "", trans: "Auto", fuel: "Petrol", area: "Port Vila", airport: false,
    price: "", depositOn: false, depositAmount: "",
  });
  const set = (k, v) => setForm({ ...form, [k]: v });

  const step0Valid = form.name.trim() && form.seats;
  const step1Valid = form.price && (!form.depositOn || form.depositAmount);

  const submit = () => {
    onAdd({
      id: Date.now(),
      name: form.name.trim(),
      type: form.type,
      supplier: "Vila 4x4 Rentals",
      verified: false,
      rating: 0,
      reviews: 0,
      price: Number(form.price),
      deposit: form.depositOn ? Number(form.depositAmount) : 0,
      seats: Number(form.seats),
      trans: form.trans,
      fuel: form.fuel,
      airport: form.airport,
      area: form.area,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.65)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{t("addVehicle.title")}</span>
          <button onClick={onClose}><X size={18} color={C.mist} /></button>
        </div>
        <div className="flex items-center gap-1.5 mb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1 rounded-full flex-1" style={{ backgroundColor: i <= step ? C.coral : C.line }} />
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <FieldLabel>{t("addVehicle.vehicleName")}</FieldLabel>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("addVehicle.vehicleNamePh")}
                className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>{t("addVehicle.vehicleType")}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TYPE_META).map(([key, m]) => {
                  const Icon = m.icon;
                  const active = form.type === key;
                  return (
                    <button key={key} onClick={() => set("type", key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                      style={{ ...body, fontWeight: 500, backgroundColor: active ? C.coral : "transparent", color: active ? "#fff" : C.mist, border: `1px solid ${active ? "transparent" : C.line}` }}>
                      <Icon size={13} /> {t(`types.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>{t("addVehicle.seats")}</FieldLabel>
                <input type="number" min="1" value={form.seats} onChange={(e) => set("seats", e.target.value)} placeholder="5"
                  className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
              </div>
              <div>
                <FieldLabel>{t("addVehicle.pickupArea")}</FieldLabel>
                <input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Port Vila"
                  className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
              </div>
              <div>
                <FieldLabel>{t("addVehicle.transmission")}</FieldLabel>
                <select value={form.trans} onChange={(e) => set("trans", e.target.value)} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle}>
                  <option style={{ color: C.ink }}>Auto</option>
                  <option style={{ color: C.ink }}>Manual</option>
                  <option style={{ color: C.ink }}>—</option>
                </select>
              </div>
              <div>
                <FieldLabel>{t("addVehicle.fuel")}</FieldLabel>
                <select value={form.fuel} onChange={(e) => set("fuel", e.target.value)} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle}>
                  <option style={{ color: C.ink }}>Petrol</option>
                  <option style={{ color: C.ink }}>Diesel</option>
                  <option style={{ color: C.ink }}>Electric</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer mt-0.5">
              <input type="checkbox" checked={form.airport} onChange={(e) => set("airport", e.target.checked)} />
              <span style={{ ...body, fontSize: 12.5, color: C.sand }}>{t("addVehicle.offerAirport")}</span>
            </label>
            <button disabled={!step0Valid} onClick={() => setStep(1)}
              className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 mt-1"
              style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
              {t("addVehicle.continueBtn")} <ArrowRight size={14} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <FieldLabel>{t("addVehicle.pricePerDay")}</FieldLabel>
              <input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="8500"
                className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>{t("addVehicle.depositPolicy")}</FieldLabel>
              <div className="flex gap-1.5">
                <button onClick={() => set("depositOn", false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
                  style={{ ...body, fontWeight: 500, backgroundColor: !form.depositOn ? C.lagoon : "transparent", color: !form.depositOn ? "#fff" : C.mist, border: `1px solid ${!form.depositOn ? "transparent" : C.line}` }}>
                  <ShieldOff size={13} /> {t("addVehicle.noDeposit")}
                </button>
                <button onClick={() => set("depositOn", true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs"
                  style={{ ...body, fontWeight: 500, backgroundColor: form.depositOn ? C.coral : "transparent", color: form.depositOn ? "#fff" : C.mist, border: `1px solid ${form.depositOn ? "transparent" : C.line}` }}>
                  <ShieldCheck size={13} /> {t("addVehicle.depositRequired")}
                </button>
              </div>
            </div>
            {form.depositOn && (
              <div>
                <FieldLabel>{t("addVehicle.depositAmount")}</FieldLabel>
                <input type="number" min="0" value={form.depositAmount} onChange={(e) => set("depositAmount", e.target.value)} placeholder="20000"
                  className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
              </div>
            )}
            <div className="rounded-xl p-3.5" style={{ backgroundColor: C.panelSoft }}>
              <div className="flex items-start gap-2">
                <Camera size={14} color={C.mist} className="mt-0.5 shrink-0" style={{ opacity: 0.7 }} />
                <p style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.75, lineHeight: 1.5 }}>
                  {t("addVehicle.photoNote")}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-0.5">
              <button onClick={() => setStep(0)} className="w-11 h-10 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                <ChevronLeft size={16} color={C.mist} />
              </button>
              <button disabled={!step1Valid} onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
                {t("addVehicle.reviewListing")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="rounded-xl overflow-hidden mb-4" style={{ backgroundColor: C.sand }}>
              <div className="h-24 flex items-center justify-center" style={{ backgroundColor: TYPE_META[form.type].color }}>
                {React.createElement(TYPE_META[form.type].icon, { size: 34, color: "rgba(255,255,255,0.92)", strokeWidth: 1.5 })}
              </div>
              <div className="p-3.5">
                <div style={{ ...display, color: C.ink, fontWeight: 700, fontSize: 15 }}>{form.name}</div>
                <div style={{ ...body, fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
                  {form.seats} {t("detail.seats").toLowerCase()} · {form.trans} · {form.fuel} · {form.area}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.lineDark}` }}>
                  <span style={{ ...mono, fontSize: 15, color: C.ink }}>{fmtVUV(Number(form.price) || 0)} {t("card.perDay")}</span>
                  <span style={{ ...body, fontSize: 11, color: form.depositOn ? C.coral : C.lagoonDeep, fontWeight: 500 }}>
                    {form.depositOn ? `${fmtVUV(Number(form.depositAmount) || 0)} ${t("card.deposit")}` : t("card.noDeposit")}
                  </span>
                </div>
              </div>
            </div>
            <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 14, lineHeight: 1.5 }}>
              {t("addVehicle.previewNote")}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="w-11 h-10 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                <ChevronLeft size={16} color={C.mist} />
              </button>
              <button onClick={submit}
                className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
                style={{ ...body, fontWeight: 600, backgroundColor: C.lagoon, color: "#fff" }}>
                <Check size={15} /> {t("addVehicle.publish")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- supplier dashboard ---------------------------------- */

const REQUESTS = [
  { id: 1, vehicle: "Toyota RAV4", customer: "L. Bennett", dates: "Aug 9 – 12", status: "pending" },
  { id: 2, vehicle: "Toyota RAV4", customer: "M. Dubois", dates: "Aug 15 – 17", status: "pending" },
  { id: 3, vehicle: "Suzuki Jimny", customer: "T. Iaruel", dates: "Aug 6 – 6", status: "accepted" },
  { id: 4, vehicle: "Suzuki Jimny", customer: "K. Naupa", dates: "Jul 28 – 30", status: "completed", customerRating: null },
];

const REVIEWS = [
  { id: 1, customer: "J. Lini", rating: 5, vehicle: "Toyota RAV4", date: "Jul 22", comment: "Smooth pickup, RAV4 was in great shape. Deposit back same day." },
  { id: 2, customer: "A. Tabi", rating: 4, vehicle: "Suzuki Jimny", date: "Jul 15", comment: "Good little car for the price. Deposit refund took an extra day." },
];

const DISPUTES = [
  { id: "DSP-7F2K1", vehicle: "Toyota RAV4", customer: "L. Bennett", category: "Deposit not refunded", description: "It's been 4 days since I returned the RAV4 and I still haven't received my 20,000 VUV deposit back.", status: "open", response: "" },
];

const COMMISSION_RATE = 0.08;

const INITIAL_INVOICES = [
  {
    id: "INV-M2", periodOffset: 2, status: "overdue", dueOffsetDays: -18,
    items: [
      { vehicle: "Toyota RAV4", customer: "R. Kalsakau", dates: "6 – 9", gross: 25500 },
      { vehicle: "Suzuki Jimny", customer: "S. Morel", dates: "12 – 13", gross: 7000 },
    ],
  },
  {
    id: "INV-M1", periodOffset: 1, status: "paid", paidOffsetDays: -3,
    items: [
      { vehicle: "Toyota RAV4", customer: "J. Lini", dates: "20 – 22", gross: 25500 },
      { vehicle: "Suzuki Jimny", customer: "A. Tabi", dates: "14 – 15", gross: 7000 },
      { vehicle: "Toyota RAV4", customer: "K. Naupa", dates: "28 – 30", gross: 17000 },
    ],
  },
  {
    id: "INV-M0", periodOffset: 0, status: "due", dueOffsetDays: 6,
    items: [
      { vehicle: "Toyota RAV4", customer: "L. Bennett", dates: "9 – 12", gross: 25500 },
      { vehicle: "Suzuki Jimny", customer: "T. Iaruel", dates: "6 – 6", gross: 7000 },
    ],
  },
];

function invoiceGross(inv) {
  return inv.items.reduce((s, it) => s + it.gross, 0);
}
function invoiceCommission(inv) {
  return Math.round(invoiceGross(inv) * COMMISSION_RATE);
}
function offsetDateLabel(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function InvoiceRow({ inv, onMarkPaid }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const gross = invoiceGross(inv);
  const commission = invoiceCommission(inv);
  const periodLabel =
    inv.periodOffset === 0 ? t("invoices.periodThisMonth")
    : inv.periodOffset === 1 ? t("invoices.periodLastMonth")
    : t("invoices.periodMonthsAgo", { n: inv.periodOffset });

  const statusColor = inv.status === "paid" ? C.lagoon : inv.status === "overdue" ? C.hibiscus : C.coralSoft;
  const statusBg = inv.status === "paid" ? "rgba(46,158,134,0.18)" : inv.status === "overdue" ? "rgba(217,82,122,0.18)" : "rgba(229,106,62,0.18)";
  const statusLabel = inv.status === "paid" ? t("invoices.statusPaid") : inv.status === "overdue" ? t("invoices.statusOverdue") : t("invoices.statusDue");

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: C.panel, border: `1px solid ${inv.status === "overdue" ? C.hibiscus : C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full p-3.5 flex items-center justify-between text-left">
        <div>
          <div style={{ ...body, fontSize: 13, fontWeight: 600, color: C.sand }}>{periodLabel}</div>
          <div style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.6, marginTop: 2 }}>
            {inv.items.length} {inv.items.length > 1 ? t("map.vehiclePlural") : t("map.vehicleSingular")} · {fmtVUV(gross)} VUV {t("invoices.colGross").toLowerCase()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div style={{ ...mono, fontSize: 15, color: C.sand }}>{fmtVUV(commission)} VUV</div>
            <span className="px-2 py-0.5 rounded-full text-[9px] inline-block mt-1" style={{ ...body, fontWeight: 600, backgroundColor: statusBg, color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <ChevronRight size={15} color={C.mist} style={{ opacity: 0.5, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
        </div>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5">
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            <div className="grid grid-cols-4 gap-1 px-2.5 py-1.5" style={{ backgroundColor: C.panelSoft }}>
              <span style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.6 }}>{t("invoices.colVehicle")}</span>
              <span style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.6 }}>{t("invoices.colCustomer")}</span>
              <span style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.6 }}>{t("invoices.colDates")}</span>
              <span style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.6, textAlign: "right" }}>{t("invoices.colAmount")}</span>
            </div>
            {inv.items.map((it, i) => (
              <div key={i} className="grid grid-cols-4 gap-1 px-2.5 py-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <span style={{ ...body, fontSize: 11, color: C.sand }}>{it.vehicle}</span>
                <span style={{ ...body, fontSize: 11, color: C.mist }}>{it.customer}</span>
                <span style={{ ...mono, fontSize: 10.5, color: C.mist }}>{it.dates}</span>
                <span style={{ ...mono, fontSize: 11, color: C.sand, textAlign: "right" }}>{fmtVUV(it.gross)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2.5">
            <span style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6 }}>
              {inv.status === "paid"
                ? t("invoices.paidOn", { date: offsetDateLabel(inv.paidOffsetDays) })
                : t("invoices.dueOn", { date: offsetDateLabel(inv.dueOffsetDays) })}
            </span>
            {inv.status !== "paid" && (
              <button onClick={() => onMarkPaid(inv.id)} className="px-2.5 py-1 rounded-full text-[10px]" style={{ ...body, fontWeight: 600, border: `1px solid ${C.line}`, color: C.mist }}>
                {t("invoices.payNow")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesSection() {
  const { t } = useLang();
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const markPaid = (id) => setInvoices(invoices.map((i) => (i.id === id ? { ...i, status: "paid", paidOffsetDays: 0 } : i)));

  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + invoiceCommission(i), 0);
  const nextDue = invoices.find((i) => i.status !== "paid");

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{t("invoices.heading")}</h3>
      </div>

      {invoices.length === 0 ? (
        <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.6 }}>{t("invoices.empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl p-3.5" style={{ backgroundColor: C.panelSoft }}>
              <div style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6 }}>{t("invoices.outstanding")}</div>
              <div style={{ ...mono, fontSize: 18, color: outstanding > 0 ? C.coralSoft : C.sand, marginTop: 3 }}>{fmtVUV(outstanding)} VUV</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ backgroundColor: C.panelSoft }}>
              <div style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6 }}>{t("invoices.nextDue")}</div>
              <div style={{ ...mono, fontSize: 18, color: C.sand, marginTop: 3 }}>
                {nextDue ? offsetDateLabel(nextDue.dueOffsetDays) : "—"}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} onMarkPaid={markPaid} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DisputeCard({ d, onRespond, onResolve }) {
  const { t } = useLang();
  const [text, setText] = useState(d.response || "");
  const [sent, setSent] = useState(!!d.response);
  const categoryLabels = t("dispute.categories");

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.panel, border: `1px solid ${d.status === "open" ? C.hibiscus : C.line}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ ...body, fontWeight: 600, backgroundColor: "rgba(217,82,122,0.18)", color: C.hibiscus }}>
            {categoryLabels[DISPUTE_CATEGORY_KEYS[d.category]] || d.category}
          </span>
          <div style={{ ...body, fontSize: 13, fontWeight: 600, color: C.sand, marginTop: 6 }}>{d.vehicle} · {d.customer}</div>
        </div>
        <span style={{ ...body, fontSize: 10, fontWeight: 600, color: d.status === "open" ? C.hibiscus : C.lagoon, whiteSpace: "nowrap" }}>
          {d.status === "open" ? t("supplier.statusOpen") : t("supplier.resolved")}
        </span>
      </div>
      <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.8, marginTop: 8, lineHeight: 1.5 }}>{d.description}</p>

      {d.status === "open" && (
        <>
          <textarea
            value={text} onChange={(e) => { setText(e.target.value); setSent(false); }}
            placeholder={t("supplier.respondPlaceholder")}
            rows={2}
            className="w-full mt-3 px-3 py-2 rounded-lg outline-none resize-none"
            style={{ ...inputStyle, fontSize: 12 }}
          />
          <div className="flex gap-2 mt-2">
            <button
              disabled={!text.trim()}
              onClick={() => { onRespond(d.id, text); setSent(true); }}
              className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
              style={{ ...body, fontWeight: 600, backgroundColor: C.lagoon, color: "#fff" }}
            >
              {t("supplier.sendResponse")}
            </button>
            <button onClick={() => onResolve(d.id)} className="flex-1 py-2 rounded-lg text-xs" style={{ ...body, fontWeight: 600, border: `1px solid ${C.line}`, color: C.mist }}>
              {t("supplier.resolve")}
            </button>
          </div>
          {sent && (
            <p style={{ ...body, fontSize: 10.5, color: C.lagoon, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={11} /> {t("supplier.responseSent")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AvailabilityCalendar({ vehicleId }) {
  const { t } = useLang();
  const { bookings, blockDate, unblockDate } = useBookings();
  const [monthOffset, setMonthOffset] = useState(0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const months = t("supplier.months");
  const weekdays = t("supplier.weekdays");
  const monthLabel = `${months[month]} ${year}`;

  const vehicleBookings = bookings.filter((b) => b.vehicleId === vehicleId);
  const dayStatus = (dateStr) => vehicleBookings.find((b) => dateStr >= b.from && dateStr <= b.to) || null;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const handleClick = (dateStr, status) => {
    if (dateStr < todayStr) return;
    if (!status) { blockDate(vehicleId, dateStr); return; }
    if (status.source === "supplier") unblockDate(status.id);
  };

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
          <ChevronLeft size={14} color={C.mist} />
        </button>
        <span style={{ ...body, fontWeight: 600, fontSize: 13, color: C.sand }}>{monthLabel}</span>
        <button onClick={() => setMonthOffset((m) => m + 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
          <ChevronRight size={14} color={C.mist} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w, i) => (
          <div key={i} className="text-center" style={{ ...body, fontSize: 9.5, color: C.mist, opacity: 0.5 }}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const status = dayStatus(dateStr);
          const isPast = dateStr < todayStr;
          let bg = "transparent", color = C.sand, clickable = !isPast;
          if (status && status.source === "customer") { bg = C.lagoon; color = "#fff"; clickable = false; }
          else if (status && status.source === "supplier") { bg = C.hibiscus; color = "#fff"; }
          else if (isPast) { color = C.mist; }
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => handleClick(dateStr, status)}
              className="aspect-square rounded-lg flex items-center justify-center text-xs"
              style={{ ...mono, backgroundColor: bg, color, opacity: isPast && !status ? 0.3 : 1, border: !status && !isPast ? `1px solid ${C.line}` : "none" }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ border: `1px solid ${C.line}` }} />
          <span style={{ ...body, fontSize: 10, color: C.mist, opacity: 0.7 }}>{t("supplier.legendAvailable")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: C.hibiscus }} />
          <span style={{ ...body, fontSize: 10, color: C.mist, opacity: 0.7 }}>{t("supplier.legendBlocked")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: C.lagoon }} />
          <span style={{ ...body, fontSize: 10, color: C.mist, opacity: 0.7 }}>{t("supplier.legendBooked")}</span>
        </div>
      </div>
      <p style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.5, marginTop: 8, lineHeight: 1.5 }}>{t("supplier.calendarHint")}</p>
    </div>
  );
}

function SupplierKYCModal({ onClose, onSubmit }) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: "", contactName: "", phone: "", email: "",
    businessType: "individual", regNumber: "", area: "Port Vila",
    idDoc: null, vehicleDoc: null, agree: false,
  });
  const set = (k, v) => setForm({ ...form, [k]: v });

  const handleUpload = async (key, file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    set(key, dataUrl);
  };

  const step0Valid = form.businessName.trim() && form.contactName.trim() && form.phone.trim() && form.email.trim();
  const step1Valid = form.idDoc && form.vehicleDoc && form.agree;

  const submit = () => {
    setSubmitting(true);
    setTimeout(() => {
      onSubmit(form);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(9,17,15,0.65)" }} onClick={!submitting ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        {submitting ? (
          <div className="text-center py-10">
            <Loader2 size={28} color={C.coral} className="mx-auto animate-spin" />
            <p style={{ ...body, fontSize: 13, color: C.mist, marginTop: 14 }}>{t("kyc.submitting")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <span style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 16 }}>{t("kyc.title")}</span>
              <button onClick={onClose}><X size={18} color={C.mist} /></button>
            </div>
            <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>{t("kyc.subtitle")}</p>

            <div className="flex items-center gap-1.5 mb-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-1 rounded-full flex-1" style={{ backgroundColor: i <= step ? C.coral : C.line }} />
              ))}
            </div>

            {step === 0 && (
              <div className="flex flex-col gap-3.5">
                <div>
                  <FieldLabel>{t("kyc.businessName")}</FieldLabel>
                  <input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder={t("kyc.businessNamePh")}
                    className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                </div>
                <div>
                  <FieldLabel>{t("kyc.contactName")}</FieldLabel>
                  <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder={t("kyc.contactNamePh")}
                    className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>{t("kyc.phone")}</FieldLabel>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+678 5551 021"
                      className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel>{t("kyc.email")}</FieldLabel>
                    <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com"
                      className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("kyc.businessType")}</FieldLabel>
                  <div className="flex gap-1.5">
                    <button onClick={() => set("businessType", "individual")}
                      className="flex-1 py-2 rounded-lg text-xs"
                      style={{ ...body, fontWeight: 500, backgroundColor: form.businessType === "individual" ? C.lagoon : "transparent", color: form.businessType === "individual" ? "#fff" : C.mist, border: `1px solid ${form.businessType === "individual" ? "transparent" : C.line}` }}>
                      {t("kyc.individual")}
                    </button>
                    <button onClick={() => set("businessType", "registered")}
                      className="flex-1 py-2 rounded-lg text-xs"
                      style={{ ...body, fontWeight: 500, backgroundColor: form.businessType === "registered" ? C.lagoon : "transparent", color: form.businessType === "registered" ? "#fff" : C.mist, border: `1px solid ${form.businessType === "registered" ? "transparent" : C.line}` }}>
                      {t("kyc.registered")}
                    </button>
                  </div>
                </div>
                {form.businessType === "registered" && (
                  <div>
                    <FieldLabel>{t("kyc.regNumber")}</FieldLabel>
                    <input value={form.regNumber} onChange={(e) => set("regNumber", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                  </div>
                )}
                <div>
                  <FieldLabel>{t("kyc.area")}</FieldLabel>
                  <input value={form.area} onChange={(e) => set("area", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
                </div>
                <button disabled={!step0Valid} onClick={() => setStep(1)}
                  className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 mt-1"
                  style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
                  {t("kyc.continueBtn")} <ArrowRight size={14} />
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3.5">
                <div style={{ ...body, fontSize: 12.5, fontWeight: 600, color: C.sand }}>{t("kyc.docsTitle")}</div>
                <div>
                  <FieldLabel>{t("kyc.idDocLabel")}</FieldLabel>
                  <label className="rounded-xl overflow-hidden cursor-pointer flex flex-col items-center justify-center relative"
                    style={{ backgroundColor: C.void, border: `1px solid ${form.idDoc ? C.lagoon : C.line}`, height: 90 }}>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleUpload("idDoc", e.target.files && e.target.files[0])} />
                    {form.idDoc ? (
                      <>
                        <img src={form.idDoc} alt="ID doc" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: C.lagoon }}><Check size={11} color="#fff" /></div>
                      </>
                    ) : (
                      <>
                        <CreditCard size={20} color={C.mist} style={{ opacity: 0.5 }} />
                        <span style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6, marginTop: 5 }}>{t("kyc.tapUpload")}</span>
                      </>
                    )}
                  </label>
                </div>
                <div>
                  <FieldLabel>{t("kyc.vehicleDocLabel")}</FieldLabel>
                  <label className="rounded-xl overflow-hidden cursor-pointer flex flex-col items-center justify-center relative"
                    style={{ backgroundColor: C.void, border: `1px solid ${form.vehicleDoc ? C.lagoon : C.line}`, height: 90 }}>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleUpload("vehicleDoc", e.target.files && e.target.files[0])} />
                    {form.vehicleDoc ? (
                      <>
                        <img src={form.vehicleDoc} alt="Vehicle doc" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: C.lagoon }}><Check size={11} color="#fff" /></div>
                      </>
                    ) : (
                      <>
                        <Truck size={20} color={C.mist} style={{ opacity: 0.5 }} />
                        <span style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6, marginTop: 5 }}>{t("kyc.tapUpload")}</span>
                      </>
                    )}
                  </label>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer mt-0.5">
                  <input type="checkbox" checked={form.agree} onChange={(e) => set("agree", e.target.checked)} className="mt-0.5" />
                  <span style={{ ...body, fontSize: 12, color: C.sand, lineHeight: 1.5 }}>{t("kyc.agree")}</span>
                </label>
                <div className="flex gap-2 mt-0.5">
                  <button onClick={() => setStep(0)} className="w-11 h-10 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                    <ChevronLeft size={16} color={C.mist} />
                  </button>
                  <button disabled={!step1Valid} onClick={() => setStep(2)}
                    className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                    style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
                    {t("kyc.continueBtn")} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ ...body, fontSize: 13, fontWeight: 700, color: C.sand, marginBottom: 10 }}>{t("kyc.reviewTitle")}</div>
                <div className="rounded-xl p-3.5 flex flex-col gap-2" style={{ backgroundColor: C.panelSoft }}>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.businessName")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.businessName}</span></div>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.contactName")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.contactName}</span></div>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.phone")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.phone}</span></div>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.email")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.email}</span></div>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.businessType")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.businessType === "registered" ? t("kyc.registered") : t("kyc.individual")}</span></div>
                  <div className="flex justify-between"><span style={{ ...body, fontSize: 11.5, color: C.mist, opacity: 0.65 }}>{t("kyc.area")}</span><span style={{ ...body, fontSize: 12, color: C.sand, fontWeight: 500 }}>{form.area}</span></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStep(1)} className="w-11 h-10 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                    <ChevronLeft size={16} color={C.mist} />
                  </button>
                  <button onClick={submit}
                    className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5"
                    style={{ ...body, fontWeight: 600, backgroundColor: C.lagoon, color: "#fff" }}>
                    <Check size={15} /> {t("kyc.submitBtn")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SupplierGate({ onOpenAuth }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { status, profile, submitApplication, simulateApproval, loadingSupplier, applyError } = useSupplierAuth();
  const [showModal, setShowModal] = useState(false);

  if (SUPABASE_CONFIGURED && !user) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
          <CreditCard size={22} color={C.mist} />
        </div>
        <h2 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 20, marginTop: 16 }}>Sign in to continue</h2>
        <p style={{ ...body, color: C.mist, opacity: 0.75, fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
          You'll need an account before applying as a supplier.
        </p>
        <button onClick={onOpenAuth}
          className="w-full mt-6 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5"
          style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
          {t("auth.signIn")} <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  if (SUPABASE_CONFIGURED && loadingSupplier) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <Loader2 size={22} color={C.coralSoft} className="mx-auto animate-spin" />
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
          <Loader2 size={22} color={C.coralSoft} />
        </div>
        <h2 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 20, marginTop: 16 }}>{t("kyc.pendingTitle")}</h2>
        {profile && (
          <p style={{ ...body, fontSize: 11.5, color: C.coralSoft, marginTop: 6 }}>{t("kyc.pendingFor")} {profile.business_name || profile.businessName}</p>
        )}
        <p style={{ ...body, color: C.mist, opacity: 0.75, fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>{t("kyc.pendingBody")}</p>

        {SUPABASE_CONFIGURED && profile ? (
          <div className="rounded-xl p-3.5 mt-6 text-left" style={{ backgroundColor: C.panelSoft }}>
            <p style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.8, marginBottom: 8, lineHeight: 1.5 }}>
              Real approval happens outside the app (RLS blocks clients from self-approving, by design). To approve this test supplier, run this in the Supabase SQL Editor:
            </p>
            <pre style={{ ...mono, fontSize: 10, color: C.coralSoft, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
{`update public.suppliers set kyc_status = 'verified', verified_at = now()\nwhere id = '${profile.id}';`}
            </pre>
            <button onClick={simulateApproval}
              className="w-full mt-3 py-2 rounded-lg text-xs"
              style={{ ...body, fontWeight: 600, border: `1px solid ${C.line}`, color: C.sand }}>
              Try approving from here (should be blocked)
            </button>
            {applyError && (
              <p style={{ ...body, fontSize: 10.5, color: C.hibiscus, marginTop: 8, lineHeight: 1.5 }}>{applyError}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-3.5 mt-6" style={{ backgroundColor: C.panelSoft }}>
            <p style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.6, marginBottom: 8 }}>{t("kyc.demoNote")}</p>
            <button onClick={simulateApproval}
              className="w-full py-2 rounded-lg text-xs"
              style={{ ...body, fontWeight: 600, border: `1px solid ${C.line}`, color: C.sand }}>
              {t("kyc.simulateApproval")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-20 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: C.coral }}>
        <CreditCard size={22} color="#fff" />
      </div>
      <h2 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 22, marginTop: 16 }}>{t("kyc.gateTitle")}</h2>
      <p style={{ ...body, color: C.mist, opacity: 0.75, fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>{t("kyc.gateBody")}</p>
      <div className="flex flex-col gap-2 mt-5 text-left">
        {[t("kyc.gateBullet1"), t("kyc.gateBullet2"), t("kyc.gateBullet3")].map((b, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
            <Check size={14} color={C.lagoon} className="shrink-0" />
            <span style={{ ...body, fontSize: 12.5, color: C.sand }}>{b}</span>
          </div>
        ))}
      </div>
      {applyError && (
        <div className="rounded-lg px-3 py-2.5 mt-4" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 11.5, color: C.hibiscus }}>{applyError}</span>
        </div>
      )}
      <button onClick={() => setShowModal(true)}
        className="w-full mt-6 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5"
        style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
        {t("kyc.startBtn")} <ArrowRight size={15} />
      </button>
      {showModal && <SupplierKYCModal onClose={() => setShowModal(false)} onSubmit={submitApplication} />}
    </div>
  );
}

function AdminDashboard() {
  const { t } = useLang();
  const { accessToken } = useAuth();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    setLoadError("");
    sbRpc("list_pending_suppliers", {}, accessToken)
      .then((rows) => setPending(rows || []))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const act = async (id, kind) => {
    setBusyId(id);
    setActionError("");
    try {
      await sbRpc(kind === "approve" ? "approve_supplier" : "reject_supplier", { target_id: id }, accessToken);
      setPending((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-8">
      <div style={{ ...mono, fontSize: 11, color: C.coralSoft, letterSpacing: "0.06em" }}>{t("admin.nav").toUpperCase()}</div>
      <div className="flex items-center justify-between mt-1">
        <h2 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 24 }}>{t("admin.heading")}</h2>
      </div>
      <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.65, marginTop: 4 }}>
        {t("admin.subheading", { n: pending.length })}
      </p>

      {loadError && (
        <div className="rounded-lg px-3 py-2.5 mt-4" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>{t("admin.loadError")} {loadError}</span>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg px-3 py-2.5 mt-4" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>{t("admin.actionError")} {actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} color={C.coralSoft} className="animate-spin" /></div>
      ) : pending.length === 0 ? (
        <div className="text-center py-16" style={{ color: C.mist, opacity: 0.6 }}>{t("admin.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3 mt-5">
          {pending.map((s) => (
            <div key={s.id} className="rounded-xl p-4" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{s.business_name}</div>
                  <div style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.75, marginTop: 4, lineHeight: 1.6 }}>
                    {s.contact_name} · {s.phone}<br />
                    {s.email}<br />
                    {s.business_type === "registered" ? "Registered company" : "Individual operator"}
                    {s.registration_number ? ` · ${s.registration_number}` : ""}
                  </div>
                  {s.submitted_at && (
                    <div style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.5, marginTop: 6 }}>
                      {t("admin.submittedOn", { date: new Date(s.submitted_at).toLocaleDateString() })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3.5">
                <button
                  disabled={busyId === s.id}
                  onClick={() => act(s.id, "approve")}
                  className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...body, fontWeight: 600, backgroundColor: C.lagoon, color: "#fff" }}
                >
                  {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t("admin.approve")}
                </button>
                <button
                  disabled={busyId === s.id}
                  onClick={() => act(s.id, "reject")}
                  className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
                  style={{ ...body, fontWeight: 600, border: `1px solid ${C.line}`, color: C.mist }}
                >
                  {t("admin.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierDashboard({ onOpenAuth }) {
  const { t } = useLang();
  const { accessToken } = useAuth();
  const { status, profile } = useSupplierAuth();
  const [reqs, setReqs] = useState(REQUESTS);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");
  const [supplierReviews, setSupplierReviews] = useState([]);
  const [myVehicles, setMyVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  const [disputes, setDisputes] = useState(DISPUTES);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputesError, setDisputesError] = useState("");
  const [calendarVehicleId, setCalendarVehicleId] = useState(null);

  const usingRealData = SUPABASE_CONFIGURED && !!profile;

  // Real disputes raised against this supplier's bookings.
  useEffect(() => {
    if (!usingRealData) return;
    let cancelled = false;
    setDisputesLoading(true);
    setDisputesError("");
    sbSelect("disputes", {
      select: "id,category,description,status,supplier_response,created_at,bookings!inner(vehicles(name)),profiles!disputes_raised_by_fkey(full_name)",
      query: `&bookings.supplier_id=eq.${profile.id}&order=created_at.desc`,
      accessToken,
    })
      .then((rows) => {
        if (cancelled) return;
        setDisputes(rows.map((d) => ({
          id: d.id,
          category: d.category,
          description: d.description,
          status: d.status,
          response: d.supplier_response || "",
          vehicle: (d.bookings && d.bookings.vehicles && d.bookings.vehicles.name) || "—",
          customer: (d.profiles && d.profiles.full_name) || "Customer",
        })));
      })
      .catch((e) => setDisputesError(e.message))
      .finally(() => !cancelled && setDisputesLoading(false));
    return () => { cancelled = true; };
  }, [usingRealData, profile, accessToken]);

  // Once we know the real signed-in supplier, load their real vehicles
  // instead of the demo "Vila 4x4 Rentals" mock set.
  useEffect(() => {
    if (!usingRealData) return;
    let cancelled = false;
    setVehiclesLoading(true);
    setVehiclesError("");
    sbSelect("vehicles", { query: `&supplier_id=eq.${profile.id}&order=created_at.desc`, accessToken })
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((r) => ({
          id: r.id, name: r.name, type: r.type,
          supplier: profile.business_name,
          verified: r.verified, rating: r.rating || 0, reviews: r.review_count || 0,
          price: r.price_per_day, deposit: r.deposit_amount, seats: r.seats,
          trans: r.transmission, fuel: r.fuel, airport: r.airport_pickup, area: r.area,
        }));
        setMyVehicles(mapped);
        setCalendarVehicleId((prev) => prev && mapped.some((v) => v.id === prev) ? prev : mapped[0]?.id);
      })
      .catch((e) => setVehiclesError(e.message))
      .finally(() => !cancelled && setVehiclesLoading(false));
    return () => { cancelled = true; };
  }, [usingRealData, profile, accessToken]);

  // Real booking requests for this supplier.
  useEffect(() => {
    if (!usingRealData) return;
    let cancelled = false;
    setBookingsLoading(true);
    setBookingsError("");
    sbSelect("bookings", {
      select: "id,status,date_from,date_to,created_at,vehicles(name),profiles(full_name)",
      query: `&supplier_id=eq.${profile.id}&order=created_at.desc`,
      accessToken,
    })
      .then((rows) => {
        if (cancelled) return;
        setReqs(rows.map((r) => ({
          id: r.id,
          vehicle: (r.vehicles && r.vehicles.name) || "—",
          customer: (r.profiles && r.profiles.full_name) || "Customer",
          dates: `${fmtDateShort(r.date_from)} – ${fmtDateShort(r.date_to)}`,
          status: r.status,
          created_at: r.created_at,
          customerRating: null,
        })));
      })
      .catch((e) => setBookingsError(e.message))
      .finally(() => !cancelled && setBookingsLoading(false));
    return () => { cancelled = true; };
  }, [usingRealData, profile, accessToken]);

  // Real reviews left for this supplier.
  useEffect(() => {
    if (!usingRealData) return;
    let cancelled = false;
    sbSelect("reviews", {
      select: "id,rating,comment,created_at,profiles(full_name),bookings(vehicles(name))",
      query: `&target_supplier_id=eq.${profile.id}&target_type=eq.supplier&order=created_at.desc`,
      accessToken,
    })
      .then((rows) => {
        if (cancelled) return;
        setSupplierReviews(rows.map((r) => ({
          id: r.id,
          customer: (r.profiles && r.profiles.full_name) || "Customer",
          rating: r.rating,
          comment: r.comment,
          vehicle: (r.bookings && r.bookings.vehicles && r.bookings.vehicles.name) || "",
          date: fmtDateShort(r.created_at),
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [usingRealData, profile, accessToken]);

  const act = async (id, newStatus) => {
    if (usingRealData) {
      const prev = reqs;
      setReqs(reqs.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
      try {
        await sbUpdate("bookings", `id=eq.${id}`, { status: newStatus }, accessToken);
      } catch (e) {
        setReqs(prev);
        setBookingsError(e.message);
      }
      return;
    }
    setReqs(reqs.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
  };
  const rateCustomer = (id, rating) => setReqs(reqs.map((r) => (r.id === id ? { ...r, customerRating: rating } : r)));
  const respondDispute = async (id, response) => {
    if (usingRealData) {
      const prev = disputes;
      setDisputes(disputes.map((d) => (d.id === id ? { ...d, response } : d)));
      try {
        await sbUpdate("disputes", `id=eq.${id}`, { supplier_response: response }, accessToken);
      } catch (e) {
        setDisputes(prev);
        setDisputesError(e.message);
      }
      return;
    }
    setDisputes(disputes.map((d) => (d.id === id ? { ...d, response } : d)));
  };
  const resolveDispute = async (id) => {
    if (usingRealData) {
      const prev = disputes;
      setDisputes(disputes.map((d) => (d.id === id ? { ...d, status: "resolved" } : d)));
      try {
        await sbUpdate("disputes", `id=eq.${id}`, { status: "resolved", resolved_at: new Date().toISOString() }, accessToken);
      } catch (e) {
        setDisputes(prev);
        setDisputesError(e.message);
      }
      return;
    }
    setDisputes(disputes.map((d) => (d.id === id ? { ...d, status: "resolved" } : d)));
  };

  const handleAdd = async (vehicle) => {
    if (usingRealData) {
      try {
        const rows = await sbInsert("vehicles", [{
          supplier_id: profile.id,
          name: vehicle.name,
          type: vehicle.type,
          price_per_day: vehicle.price,
          deposit_amount: vehicle.deposit,
          seats: vehicle.seats,
          transmission: vehicle.trans,
          fuel: vehicle.fuel,
          airport_pickup: vehicle.airport,
          area: vehicle.area,
        }], accessToken);
        const r = rows[0];
        const mapped = {
          id: r.id, name: r.name, type: r.type, supplier: profile.business_name,
          verified: r.verified, rating: 0, reviews: 0,
          price: r.price_per_day, deposit: r.deposit_amount, seats: r.seats,
          trans: r.transmission, fuel: r.fuel, airport: r.airport_pickup, area: r.area,
        };
        setMyVehicles((prev) => [mapped, ...prev]);
        setCalendarVehicleId((prev) => prev || mapped.id);
      } catch (e) {
        setVehiclesError(e.message);
        setShowAdd(false);
        return;
      }
    } else {
      setMyVehicles([vehicle, ...myVehicles]);
    }
    setShowAdd(false);
    setJustAdded(vehicle.name);
    setTimeout(() => setJustAdded(null), 4000);
  };

  const reviewsSource = usingRealData ? supplierReviews : REVIEWS;
  const avgRating = reviewsSource.length
    ? (reviewsSource.reduce((s, r) => s + r.rating, 0) / reviewsSource.length).toFixed(1)
    : "—";
  const monthStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }, []);
  const monthlyBookingsCount = usingRealData
    ? reqs.filter((r) => r.created_at && new Date(r.created_at) >= monthStart).length
    : 11;
  const statusLabel = (s) => (s === "accepted" ? t("supplier.statusAccepted") : s === "declined" ? t("supplier.statusDeclined") : t("supplier.statusPending"));

  if (status !== "verified") {
    return <SupplierGate onOpenAuth={onOpenAuth} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-10 py-8">
      <div className="flex items-center gap-2">
        <div style={{ ...mono, fontSize: 11, color: C.coralSoft, letterSpacing: "0.06em" }}>{t("supplier.dashboardLabel")}</div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(46,158,134,0.15)" }}>
          <BadgeCheck size={11} color={C.lagoon} />
          <span style={{ ...body, fontSize: 9.5, fontWeight: 600, color: C.lagoon }}>{t("kyc.verifiedBadge")}</span>
        </span>
      </div>
      <h2 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 26, marginTop: 4 }}>
        {t("supplier.welcomeBack", { supplier: (profile && profile.business_name) || "Vila 4x4 Rentals" })}
      </h2>

      {vehiclesError && (
        <div className="rounded-lg px-3 py-2.5 mt-3" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>{vehiclesError}</span>
        </div>
      )}
      {bookingsError && (
        <div className="rounded-lg px-3 py-2.5 mt-3" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>{bookingsError}</span>
        </div>
      )}
      {disputesError && (
        <div className="rounded-lg px-3 py-2.5 mt-3" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
          <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>{disputesError}</span>
        </div>
      )}

      {justAdded && (
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 mt-4" style={{ backgroundColor: "rgba(46,158,134,0.15)", border: `1px solid ${C.lagoon}` }}>
          <Check size={15} color={C.lagoon} />
          <span style={{ ...body, fontSize: 13, color: C.sand }}>
            {t("supplier.justAdded", { name: justAdded })}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label={t("supplier.activeListings")} value={myVehicles.length} icon={LayoutGrid} />
        <Stat label={t("supplier.pendingRequests")} value={reqs.filter((r) => r.status === "pending").length} icon={Inbox} />
        <Stat label={t("supplier.avgRating")} value={avgRating} icon={Star} />
        <Stat label={t("supplier.monthlyBookings")} value={monthlyBookingsCount} icon={TrendingUp} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{t("supplier.bookingRequests")}</h3>
          </div>
          <div className="flex flex-col gap-2.5">
            {reqs.length === 0 && !bookingsLoading && (
              <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.6 }}>—</p>
            )}
            {reqs.map((r) => (
              <div key={r.id} className="rounded-xl p-3.5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ ...body, color: C.sand, fontWeight: 600, fontSize: 13.5 }}>{r.vehicle}</div>
                    <div style={{ ...body, color: C.mist, opacity: 0.65, fontSize: 12 }}>{r.customer} · {r.dates}</div>
                  </div>
                  {r.status === "pending" ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => act(r.id, "accepted")} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: C.lagoon }}>
                        <Check size={13} color="#fff" />
                      </button>
                      <button onClick={() => act(r.id, "declined")} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.line}` }}>
                        <X size={13} color={C.mist} />
                      </button>
                    </div>
                  ) : r.status !== "completed" ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px]" style={{ ...body, fontWeight: 600, backgroundColor: r.status === "accepted" ? "rgba(46,158,134,0.18)" : "rgba(217,82,122,0.18)", color: r.status === "accepted" ? C.lagoon : C.hibiscus }}>
                      {statusLabel(r.status)}
                    </span>
                  ) : null}
                </div>
                {r.status === "completed" && (
                  <div className="mt-2.5 pt-2.5 flex items-center justify-between" style={{ borderTop: `1px dashed ${C.line}` }}>
                    <span style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.65 }}>
                      {r.customerRating ? t("supplier.ratedGuest") : t("supplier.rateGuest")}
                    </span>
                    {r.customerRating ? (
                      <StarDisplay rating={r.customerRating} size={13} />
                    ) : (
                      <StarRatingInput value={0} onChange={(n) => rateCustomer(r.id, n)} size={15} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{t("supplier.reviewsFromCustomers")}</h3>
            <div className="flex flex-col gap-2.5">
              {reviewsSource.length === 0 && (
                <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.6 }}>—</p>
              )}
              {reviewsSource.map((rv) => (
                <div key={rv.id} className="rounded-xl p-3.5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
                  <div className="flex items-center justify-between">
                    <span style={{ ...body, color: C.sand, fontWeight: 600, fontSize: 13 }}>{rv.customer}</span>
                    <StarDisplay rating={rv.rating} size={12} />
                  </div>
                  <p style={{ ...body, fontSize: 12, color: C.mist, opacity: 0.75, marginTop: 6, lineHeight: 1.5 }}>{rv.comment}</p>
                  <p style={{ ...body, fontSize: 10.5, color: C.mist, opacity: 0.5, marginTop: 5 }}>{rv.vehicle} · {rv.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{t("supplier.yourListings")}</h3>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full" style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}>
              <Plus size={13} /> {t("supplier.addVehicle")}
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {myVehicles.length === 0 && !vehiclesLoading && (
              <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.6 }}>—</p>
            )}
            {myVehicles.map((v) => (
              <div key={v.id} className="rounded-xl p-3.5 flex items-center justify-between" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <div style={{ ...body, color: C.sand, fontWeight: 600, fontSize: 13.5 }}>{v.name}</div>
                    {!v.verified && v.reviews === 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px]" style={{ ...body, fontWeight: 600, backgroundColor: "rgba(229,106,62,0.18)", color: C.coralSoft }}>
                        {t("supplier.pending")}
                      </span>
                    )}
                  </div>
                  <div style={{ ...body, color: C.mist, opacity: 0.65, fontSize: 12 }}>{fmtVUV(v.price)} {t("card.perDay")} · {v.deposit ? `${fmtVUV(v.deposit)} ${t("card.deposit")}` : t("card.noDeposit")}</div>
                </div>
                <DepositGauge amount={v.deposit} size={28} />
              </div>
            ))}
          </div>

          <div className="rounded-xl p-3.5 mt-4" style={{ backgroundColor: C.panelSoft }}>
            <div style={{ ...body, fontSize: 12, color: C.mist, lineHeight: 1.6 }}>
              <b style={{ color: C.sand }}>{t("supplier.serviceFeeLabel")}</b> {t("supplier.serviceFee")}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{t("supplier.calendarHeading")}</h3>
          <div className="flex items-center gap-1.5">
            <span style={{ ...body, fontSize: 11, color: C.mist, opacity: 0.6 }}>{t("supplier.selectVehicle")}</span>
            <select
              value={calendarVehicleId || ""}
              onChange={(e) => setCalendarVehicleId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
              style={{ ...body, backgroundColor: C.panel, color: C.sand, border: `1px solid ${C.line}` }}
            >
              {myVehicles.map((v) => (
                <option key={v.id} value={v.id} style={{ color: C.ink }}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>
        {calendarVehicleId && <AvailabilityCalendar vehicleId={calendarVehicleId} />}
      </div>

      <InvoicesSection />

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <h3 style={{ ...display, color: C.sand, fontWeight: 700, fontSize: 15 }}>{t("supplier.disputesHeading")}</h3>
          {disputes.filter((d) => d.status === "open").length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ ...body, fontWeight: 600, backgroundColor: "rgba(217,82,122,0.18)", color: C.hibiscus }}>
              {t("supplier.disputesOpenCount", { n: disputes.filter((d) => d.status === "open").length })}
            </span>
          )}
        </div>
        {disputes.length === 0 ? (
          <p style={{ ...body, fontSize: 12.5, color: C.mist, opacity: 0.6 }}>{t("supplier.noDisputes")}</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-2.5">
            {disputes.map((d) => (
              <DisputeCard key={d.id} d={d} onRespond={respondDispute} onResolve={resolveDispute} />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddVehicleModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

function AppInner() {
  const { t } = useLang();
  const [mode, setMode] = useState("renter");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [deposit, setDeposit] = useState("all");
  const [sort, setSort] = useState("rating");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(null);
  const [idVerified, setIdVerified] = useState(false);
  const [showIdModal, setShowIdModal] = useState(false);
  const [pendingVehicle, setPendingVehicle] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // Live vehicle data from Supabase, once configured — falls back to the
  // mock VEHICLES array so the prototype keeps working before you connect
  // a real backend.
  const [dbVehicles, setDbVehicles] = useState(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(SUPABASE_CONFIGURED);
  const [vehiclesError, setVehiclesError] = useState("");

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    let cancelled = false;
    setVehiclesLoading(true);
    sbSelect("vehicles", {
      select: "id,name,type,price_per_day,deposit_amount,seats,transmission,fuel,airport_pickup,area,verified,rating,review_count,suppliers(business_name)",
    })
      .then((rows) => {
        if (cancelled) return;
        setDbVehicles(rows.map((r) => ({
          id: r.id, name: r.name, type: r.type,
          supplier: (r.suppliers && r.suppliers.business_name) || "—",
          verified: r.verified, rating: r.rating || 0, reviews: r.review_count || 0,
          price: r.price_per_day, deposit: r.deposit_amount, seats: r.seats,
          trans: r.transmission, fuel: r.fuel, airport: r.airport_pickup, area: r.area,
        })));
      })
      .catch((e) => !cancelled && setVehiclesError(e.message))
      .finally(() => !cancelled && setVehiclesLoading(false));
    return () => { cancelled = true; };
  }, []);

  const sourceVehicles = SUPABASE_CONFIGURED && dbVehicles ? dbVehicles : VEHICLES;

  const handleBookRequest = (v) => {
    setSelected(null);
    setShowCompare(false);
    if (idVerified) {
      setBooking(v);
    } else {
      setPendingVehicle(v);
      setShowIdModal(true);
    }
  };

  const handleVerified = () => {
    setIdVerified(true);
    setShowIdModal(false);
    if (pendingVehicle) {
      setBooking(pendingVehicle);
      setPendingVehicle(null);
    }
  };

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const compareVehicles = sourceVehicles.filter((v) => compareIds.includes(v.id));

  const results = useMemo(() => {
    let list = sourceVehicles.filter((v) => {
      const matchesQuery = (v.name + v.supplier + v.area).toLowerCase().includes(query.toLowerCase());
      const matchesType = type === "all" || v.type === type;
      const matchesDeposit = deposit === "all" || v.deposit === 0;
      return matchesQuery && matchesType && matchesDeposit;
    });
    if (sort === "priceLow") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "priceHigh") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [sourceVehicles, query, type, deposit, sort]);

  return (
    <div className="min-h-screen w-full" style={{ ...body, backgroundColor: C.void }}>
      <style>{FONTS}</style>
      <Header mode={mode} setMode={setMode} idVerified={idVerified} onOpenAuth={() => setShowAuth(true)} />

      {mode === "renter" ? (
        <>
          <Hero query={query} setQuery={setQuery} />
          <div className="max-w-5xl mx-auto px-5 md:px-10 py-8 pb-24">
            {SUPABASE_CONFIGURED && vehiclesLoading && (
              <div className="flex items-center gap-2 mb-4" style={{ color: C.mist, opacity: 0.6 }}>
                <Loader2 size={14} className="animate-spin" /> <span style={{ ...body, fontSize: 12.5 }}>Loading vehicles…</span>
              </div>
            )}
            {SUPABASE_CONFIGURED && vehiclesError && (
              <div className="rounded-lg px-3 py-2.5 mb-4" style={{ backgroundColor: "rgba(217,82,122,0.15)" }}>
                <span style={{ ...body, fontSize: 12, color: C.hibiscus }}>Couldn't load live vehicles: {vehiclesError}</span>
              </div>
            )}
            <Filters type={type} setType={setType} deposit={deposit} setDeposit={setDeposit} sort={sort} setSort={setSort} view={view} setView={setView} />
            {results.length === 0 ? (
              <div className="text-center py-16" style={{ color: C.mist, opacity: 0.6 }}>{t("filters.noResults")}</div>
            ) : view === "map" ? (
              <MapView vehicles={results} onSelect={setSelected} compareIds={compareIds} onToggleCompare={toggleCompare} />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((v) => (
                  <VehicleCard key={v.id} v={v} onSelect={setSelected} compareIds={compareIds} onToggleCompare={toggleCompare} />
                ))}
              </div>
            )}
          </div>

          {compareIds.length > 0 && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-full shadow-lg" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
              <span style={{ ...body, fontSize: 12.5, color: C.sand, fontWeight: 500 }}>{t("compare.barLabel", { n: compareIds.length })}</span>
              <button
                onClick={() => setShowCompare(true)}
                disabled={compareIds.length < 2}
                className="px-3.5 py-1.5 rounded-full text-xs disabled:opacity-40"
                style={{ ...body, fontWeight: 600, backgroundColor: C.coral, color: "#fff" }}
              >
                {t("compare.openBtn")}
              </button>
              <button onClick={() => setCompareIds([])} className="text-xs" style={{ ...body, color: C.mist, opacity: 0.6 }}>
                {t("compare.clearAll")}
              </button>
            </div>
          )}
        </>
      ) : mode === "admin" ? (
        <AdminDashboard />
      ) : (
        <SupplierDashboard onOpenAuth={() => setShowAuth(true)} />
      )}

      {selected && (
        <VehicleDetail
          v={selected}
          onClose={() => setSelected(null)}
          onBook={handleBookRequest}
          idVerified={idVerified}
        />
      )}
      {showIdModal && (
        <IDVerificationModal
          onClose={() => { setShowIdModal(false); setPendingVehicle(null); }}
          onVerified={handleVerified}
        />
      )}
      {showCompare && (
        <ComparisonModal
          vehicles={compareVehicles}
          onClose={() => setShowCompare(false)}
          onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
          onBook={handleBookRequest}
        />
      )}
      {booking && <BookingModal v={booking} onClose={() => setBooking(null)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BookingsProvider>
          <SupplierAuthProvider>
            <AppInner />
          </SupplierAuthProvider>
        </BookingsProvider>
      </AuthProvider>
    </LangProvider>
  );
}
