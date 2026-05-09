'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView, AnimatePresence, type Variants } from 'framer-motion';
import Link from 'next/link';
import { Syne, Inter } from 'next/font/google';
import {
  Check,
  ChevronDown,
  Menu,
  X,
  Zap,
  BarChart2,
  Target,
  BookOpen,
  Users,
  Smartphone,
  Play,
  ArrowRight,
  Twitter,
  Instagram,
  Linkedin,
} from 'lucide-react';

const syne = Syne({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-syne' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' });

/* ─── Design tokens ─────────────────────────────────────────── */
const AMBER = '#FFB020';
const BG = '#0E0E10';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

/* ─── Motion variants ────────────────────────────────────────── */
const EASE_CUSTOM = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: EASE_CUSTOM },
  }),
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ─── Helpers ────────────────────────────────────────────────── */
function InViewSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={stagger}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Grain overlay ──────────────────────────────────────────── */
function GrainOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] opacity-[0.022]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }}
    />
  );
}

/* ─── Navbar ─────────────────────────────────────────────────── */
function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 1]);

  const links = ['Features', 'Pricing', 'FAQ'];

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50"
      style={{ backgroundColor: 'transparent' }}
    >
      <motion.div
        className="absolute inset-0 border-b"
        style={{
          opacity: bgOpacity,
          backgroundColor: 'rgba(14,14,16,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderColor: CARD_BORDER,
        }}
      />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/landingpage" className="flex items-center gap-2 group">
          <span
            className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-110"
            style={{ backgroundColor: AMBER, boxShadow: `0 0 8px ${AMBER}` }}
          />
          <span className={`${syne.className} text-white font-700 text-lg tracking-tight`}>
            FutsalHub
          </span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase()}`}
              className={`${inter.className} text-sm text-white/50 hover:text-white transition-colors`}
            >
              {l}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/signin"
            className={`${inter.className} text-sm text-white/60 hover:text-white transition-colors`}
          >
            Se connecter
          </Link>
          <Link
            href="/signup"
            className={`${inter.className} text-sm font-500 px-5 py-2 rounded-full transition-all`}
            style={{
              backgroundColor: AMBER,
              color: '#0E0E10',
            }}
          >
            Démarrer gratuitement
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t overflow-hidden"
            style={{ backgroundColor: 'rgba(14,14,16,0.98)', borderColor: CARD_BORDER }}
          >
            <div className="px-5 py-4 flex flex-col gap-4">
              {links.map((l) => (
                <a
                  key={l}
                  href={`#${l.toLowerCase()}`}
                  onClick={() => setOpen(false)}
                  className={`${inter.className} text-white/70 hover:text-white`}
                >
                  {l}
                </a>
              ))}
              <Link
                href="/signup"
                className={`${inter.className} text-center text-sm font-500 px-5 py-2.5 rounded-full`}
                style={{ backgroundColor: AMBER, color: '#0E0E10' }}
              >
                Démarrer gratuitement
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/* ─── Hero tactical mockup ────────────────────────────────────── */
function TacticalMockup() {
  const players = [
    { id: 1, x: 50, y: 82, label: 'GK', color: '#FFB020' },
    { id: 2, x: 22, y: 58, label: 'DF', color: '#60A5FA' },
    { id: 3, x: 78, y: 58, label: 'DF', color: '#60A5FA' },
    { id: 4, x: 30, y: 35, label: 'MF', color: '#34D399' },
    { id: 5, x: 70, y: 35, label: 'MF', color: '#34D399' },
  ];

  const opponentPlayers = [
    { id: 6, x: 50, y: 18, label: 'GK', color: '#F87171' },
    { id: 7, x: 25, y: 42, label: 'D', color: '#F87171' },
    { id: 8, x: 75, y: 42, label: 'D', color: '#F87171' },
    { id: 9, x: 40, y: 25, label: 'A', color: '#F87171' },
    { id: 10, x: 60, y: 25, label: 'A', color: '#F87171' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.4, ease: EASE_CUSTOM }}
      className="relative w-full max-w-[420px] mx-auto lg:mx-0"
    >
      {/* Glow effect behind card */}
      <div
        className="absolute inset-0 rounded-2xl blur-3xl opacity-20"
        style={{ backgroundColor: AMBER }}
      />

      {/* Card */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          backgroundColor: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: CARD_BORDER }}
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className={`${inter.className} text-xs text-white/40`}>Schéma tactique · 4-1</span>
          </div>
          <div className="flex gap-2">
            <span
              className={`${inter.className} text-xs px-2 py-0.5 rounded-md`}
              style={{ backgroundColor: `${AMBER}20`, color: AMBER }}
            >
              Live
            </span>
          </div>
        </div>

        {/* Court SVG */}
        <div className="px-4 pt-3 pb-2">
          <svg viewBox="0 0 200 140" className="w-full" style={{ height: 220 }}>
            {/* Court background */}
            <rect x="4" y="4" width="192" height="132" rx="6" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.2)" strokeWidth="1.5" />

            {/* Center line */}
            <line x1="4" y1="70" x2="196" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

            {/* Center circle */}
            <circle cx="100" cy="70" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <circle cx="100" cy="70" r="2" fill="rgba(255,255,255,0.15)" />

            {/* Goal areas */}
            <rect x="4" y="50" width="28" height="40" rx="2" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <rect x="168" y="50" width="28" height="40" rx="2" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

            {/* Penalty spots */}
            <circle cx="36" cy="70" r="1.5" fill="rgba(255,255,255,0.2)" />
            <circle cx="164" cy="70" r="1.5" fill="rgba(255,255,255,0.2)" />

            {/* Animated movement arrows */}
            <motion.path
              d="M 44 116 Q 60 95 60 70"
              fill="none"
              stroke={AMBER}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.7 }}
              transition={{ duration: 1.2, delay: 1.2, ease: 'easeInOut' }}
            />
            <motion.path
              d="M 156 116 Q 140 95 140 70"
              fill="none"
              stroke={AMBER}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.7 }}
              transition={{ duration: 1.2, delay: 1.5, ease: 'easeInOut' }}
            />
            <motion.path
              d="M 60 70 Q 100 55 140 70"
              fill="none"
              stroke="#60A5FA"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.6 }}
              transition={{ duration: 1.0, delay: 1.8, ease: 'easeInOut' }}
            />

            {/* Our players */}
            {players.map((p, i) => (
              <motion.g
                key={p.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
              >
                <circle
                  cx={p.x * 2}
                  cy={p.y * 1.4}
                  r="8"
                  fill={`${p.color}20`}
                  stroke={p.color}
                  strokeWidth="1.5"
                />
                <text
                  x={p.x * 2}
                  y={p.y * 1.4 + 3.5}
                  textAnchor="middle"
                  fill={p.color}
                  fontSize="5.5"
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  {p.label}
                </text>
              </motion.g>
            ))}

            {/* Opponent players */}
            {opponentPlayers.map((p, i) => (
              <motion.g
                key={p.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.8 + i * 0.08 }}
              >
                <circle
                  cx={p.x * 2}
                  cy={p.y * 1.4}
                  r="7"
                  fill="rgba(248,113,113,0.1)"
                  stroke="rgba(248,113,113,0.5)"
                  strokeWidth="1"
                />
                <text
                  x={p.x * 2}
                  y={p.y * 1.4 + 3.5}
                  textAnchor="middle"
                  fill="rgba(248,113,113,0.7)"
                  fontSize="5"
                  fontFamily="monospace"
                >
                  {p.label}
                </text>
              </motion.g>
            ))}
          </svg>
        </div>

        {/* Card footer — formation chips */}
        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: CARD_BORDER }}
        >
          <div className="flex gap-2">
            {['2-2-1', '3-1-1', '4-0-1'].map((f) => (
              <button
                key={f}
                className={`${inter.className} text-xs px-2.5 py-1 rounded-md transition-all`}
                style={
                  f === '2-2-1'
                    ? { backgroundColor: `${AMBER}25`, color: AMBER, border: `1px solid ${AMBER}40` }
                    : { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                {f}
              </button>
            ))}
          </div>
          <span className={`${inter.className} text-xs text-white/30`}>5 joueurs</span>
        </div>
      </div>

      {/* Floating stat badge */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 1.4 }}
        className="absolute -right-4 top-1/3 rounded-xl p-3 shadow-xl"
        style={{
          backgroundColor: 'rgba(14,14,16,0.9)',
          border: `1px solid ${CARD_BORDER}`,
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className={`${inter.className} text-xs text-white/50 mb-1`}>Possession</div>
        <div className={`${syne.className} text-lg font-700`} style={{ color: AMBER }}>67%</div>
        <div className="flex gap-0.5 mt-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: i < 7 ? AMBER : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Hero section ───────────────────────────────────────────── */
function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
      style={{ backgroundColor: BG }}
    >
      {/* Abstract background shapes */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large amber glow top-right */}
        <div
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07]"
          style={{ backgroundColor: AMBER }}
        />
        {/* Subtle blue glow bottom-left */}
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.05] bg-blue-500" />

        {/* Abstract court lines */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.035]"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <rect x="200" y="150" width="1040" height="600" rx="12" stroke="white" strokeWidth="1.5" />
          <line x1="200" y1="450" x2="1240" y2="450" stroke="white" strokeWidth="1" />
          <circle cx="720" cy="450" r="80" stroke="white" strokeWidth="1" />
          <circle cx="720" cy="450" r="6" fill="white" />
          <rect x="200" y="330" width="120" height="240" rx="4" stroke="white" strokeWidth="1" />
          <rect x="1120" y="330" width="120" height="240" rx="4" stroke="white" strokeWidth="1" />
        </svg>

        {/* Floating geometric accents */}
        <motion.div
          className="absolute top-1/4 left-[15%] w-px h-32 opacity-20"
          style={{ backgroundColor: AMBER }}
          animate={{ scaleY: [1, 1.4, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 left-[20%] w-16 h-px opacity-10"
          style={{ backgroundColor: AMBER }}
          animate={{ scaleX: [1, 1.6, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-24 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left: copy */}
        <div>
          <motion.div
            variants={fadeUp}
            custom={0}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8"
            style={{
              backgroundColor: `${AMBER}15`,
              border: `1px solid ${AMBER}30`,
            }}
          >
            <Zap size={12} style={{ color: AMBER }} />
            <span className={`${inter.className} text-xs`} style={{ color: AMBER }}>
              Plateforme tout-en-un pour le futsal
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            initial="hidden"
            animate="visible"
            className={`${syne.className} text-5xl sm:text-6xl lg:text-[64px] font-800 leading-[1.05] text-white mb-6`}
          >
            Le terrain de jeu
            <br />
            <span style={{ color: AMBER }}>de votre staff</span>
            <br />
            technique.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            initial="hidden"
            animate="visible"
            className={`${inter.className} text-lg text-white/50 leading-relaxed mb-10 max-w-md`}
          >
            Séances, analyses de matchs, schémas tactiques animés et bibliothèque d&apos;exercices.
            Tout ce qu&apos;il vous faut, dans une seule application.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={3}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap gap-3"
          >
            <Link
              href="/signup"
              className={`${inter.className} inline-flex items-center gap-2 px-6 py-3 rounded-full font-500 text-sm transition-all hover:opacity-90`}
              style={{ backgroundColor: AMBER, color: '#0E0E10' }}
            >
              Essayer gratuitement
              <ArrowRight size={15} />
            </Link>
            <a
              href="#demo"
              className={`${inter.className} inline-flex items-center gap-2 px-6 py-3 rounded-full font-500 text-sm text-white/70 hover:text-white transition-all`}
              style={{ border: `1px solid ${CARD_BORDER}` }}
            >
              <Play size={13} fill="currentColor" />
              Voir une démo
            </a>
          </motion.div>

          {/* Social proof */}
          <motion.div
            variants={fadeUp}
            custom={4}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-4 mt-10"
          >
            <div className="flex -space-x-2">
              {['#FFB020', '#60A5FA', '#34D399', '#F87171', '#A78BFA'].map((c, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-700 text-white"
                  style={{ backgroundColor: `${c}30`, borderColor: BG, color: c }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span className={`${inter.className} text-sm text-white/40`}>
              Rejoint par <span className="text-white/70">500+ coachs</span> cette saison
            </span>
          </motion.div>
        </div>

        {/* Right: tactical mockup */}
        <motion.div
          className="flex justify-center lg:justify-end"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <TacticalMockup />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Features ──────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: '📋',
    title: 'Gestion des séances',
    desc: 'Créez, planifiez et partagez vos entraînements en quelques minutes. Templates réutilisables.',
    accent: '#FFB020',
  },
  {
    icon: '📊',
    title: 'Suivi des matchs',
    desc: 'Scores, statistiques avancées et analyse de performance après chaque rencontre.',
    accent: '#60A5FA',
  },
  {
    icon: '🎯',
    title: 'Schémas tactiques animés',
    desc: 'Visualisez vos systèmes en mouvement sur un terrain interactif. Partagez avec vos joueurs.',
    accent: '#34D399',
  },
  {
    icon: '📚',
    title: 'Bibliothèque d\'exercices',
    desc: '+100 exercices catégorisés par objectif, intensité et nombre de joueurs.',
    accent: '#F59E0B',
  },
  {
    icon: '👥',
    title: 'Profils joueurs',
    desc: 'Suivez l\'évolution individuelle et collective de votre effectif sur toute la saison.',
    accent: '#A78BFA',
  },
  {
    icon: '📱',
    title: 'App mobile',
    desc: 'Accédez à tout votre staff technique depuis le terrain. iOS et Android.',
    accent: '#F87171',
  },
];

function Features() {
  return (
    <section id="features" className="relative py-32" style={{ backgroundColor: BG }}>
      {/* Top separator */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${CARD_BORDER}, transparent)` }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <InViewSection>
          <motion.div variants={fadeUp} className="mb-16">
            <span
              className={`${inter.className} text-xs uppercase tracking-[0.15em] mb-4 block`}
              style={{ color: AMBER }}
            >
              Fonctionnalités
            </span>
            <h2 className={`${syne.className} text-4xl sm:text-5xl font-700 text-white`}>
              Tout ce dont votre
              <br />
              <span className="text-white/40">staff a besoin.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                custom={i * 0.5}
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ duration: 0.2 }}
                className="group relative rounded-2xl p-6 cursor-default"
                style={{
                  backgroundColor: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                }}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
                  style={{ backgroundColor: `${f.accent}08` }}
                />

                <div className="relative">
                  <div className="text-3xl mb-4">{f.icon}</div>
                  <h3 className={`${syne.className} text-base font-700 text-white mb-2`}>
                    {f.title}
                  </h3>
                  <p className={`${inter.className} text-sm text-white/45 leading-relaxed`}>
                    {f.desc}
                  </p>
                </div>

                {/* Bottom accent line on hover */}
                <div
                  className="absolute bottom-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ backgroundColor: f.accent }}
                />
              </motion.div>
            ))}
          </div>
        </InViewSection>
      </div>
    </section>
  );
}

/* ─── Stats band ─────────────────────────────────────────────── */
function StatsBand() {
  const stats = [
    { value: '500+', label: 'Coachs actifs' },
    { value: '10K+', label: 'Séances créées' },
    { value: '3K+', label: 'Matchs analysés' },
    { value: '98%', label: 'Satisfaction' },
  ];

  return (
    <section style={{ backgroundColor: BG }}>
      <div
        className="max-w-7xl mx-auto mx-5 sm:mx-8 rounded-2xl"
        style={{ border: `1px solid ${CARD_BORDER}` }}
      >
        <InViewSection className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0">
          {stats.map((s, i) => (
            <motion.div key={i} variants={fadeUp} custom={i * 0.5} className="px-8 py-8 text-center">
              <div className={`${syne.className} text-4xl font-700 mb-1`} style={{ color: AMBER }}>
                {s.value}
              </div>
              <div className={`${inter.className} text-sm text-white/40`}>{s.label}</div>
            </motion.div>
          ))}
        </InViewSection>
      </div>
    </section>
  );
}

/* ─── Demo / Screenshots ─────────────────────────────────────── */
function SessionPlannerMockup() {
  const exercises = [
    { name: 'Rondo 4v2', duration: '12 min', intensity: 'Modéré', color: '#60A5FA' },
    { name: 'Pressing haut 5v5', duration: '15 min', intensity: 'Élevé', color: '#F87171' },
    { name: 'Transition off.', duration: '10 min', intensity: 'Modéré', color: '#34D399' },
    { name: 'Jeu libre 5v5', duration: '20 min', intensity: 'Élevé', color: '#F87171' },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden h-full"
      style={{ backgroundColor: '#111114', border: `1px solid ${CARD_BORDER}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: CARD_BORDER }}
      >
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/50" />
          <span className="w-2 h-2 rounded-full bg-yellow-400/50" />
          <span className="w-2 h-2 rounded-full bg-green-500/50" />
        </div>
        <span className={`${inter.className} text-[11px] text-white/35`}>Séance · Mardi 13 mai</span>
      </div>

      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className={`${syne.className} text-sm font-700 text-white`}>Entraînement technique</span>
          <span
            className={`${inter.className} text-[10px] px-2 py-0.5 rounded-md`}
            style={{ backgroundColor: `${AMBER}20`, color: AMBER }}
          >
            75 min
          </span>
        </div>

        {exercises.map((ex, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${CARD_BORDER}` }}
          >
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{ backgroundColor: ex.color }}
            />
            <div className="flex-1 min-w-0">
              <div className={`${inter.className} text-xs text-white font-500 truncate`}>{ex.name}</div>
              <div className={`${inter.className} text-[10px] text-white/35`}>{ex.duration}</div>
            </div>
            <span
              className={`${inter.className} text-[9px] px-1.5 py-0.5 rounded`}
              style={{
                backgroundColor: `${ex.color}15`,
                color: ex.color,
                border: `1px solid ${ex.color}25`,
              }}
            >
              {ex.intensity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchStatsMockup() {
  const players = [
    { name: 'A. Martins', goals: 2, assists: 1, rating: 8.4 },
    { name: 'R. Benali', goals: 1, assists: 2, rating: 8.1 },
    { name: 'K. Diallo', goals: 0, assists: 1, rating: 7.5 },
    { name: 'T. Souza', goals: 1, assists: 0, rating: 7.8 },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden h-full"
      style={{ backgroundColor: '#111114', border: `1px solid ${CARD_BORDER}` }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: CARD_BORDER }}
      >
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/50" />
          <span className="w-2 h-2 rounded-full bg-yellow-400/50" />
          <span className="w-2 h-2 rounded-full bg-green-500/50" />
        </div>
        <span className={`${inter.className} text-[11px] text-white/35`}>Stats · FC Lyon B 4–2 Paris FC</span>
      </div>

      <div className="p-4">
        {/* Score */}
        <div className="flex items-center justify-center gap-4 py-3 mb-4">
          <span className={`${syne.className} text-2xl font-700 text-white`}>4</span>
          <span className={`${inter.className} text-xs text-white/30`}>–</span>
          <span className={`${syne.className} text-2xl font-700 text-white/40`}>2</span>
        </div>

        {/* Possession bar */}
        <div className="mb-4">
          <div className="flex justify-between mb-1.5">
            <span className={`${inter.className} text-[10px] text-white/40`}>Possession</span>
            <span className={`${inter.className} text-[10px]`} style={{ color: AMBER }}>67%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: '67%', backgroundColor: AMBER }}
            />
          </div>
        </div>

        {/* Players */}
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={`${inter.className} text-[11px] text-white/60`}>{p.name}</span>
              <div className="flex items-center gap-3">
                <span className={`${inter.className} text-[10px] text-white/35`}>{p.goals}G {p.assists}A</span>
                <span
                  className={`${syne.className} text-xs font-700 w-8 text-center rounded`}
                  style={{
                    color: p.rating >= 8 ? '#34D399' : AMBER,
                    backgroundColor: p.rating >= 8 ? 'rgba(52,211,153,0.1)' : `${AMBER}10`,
                  }}
                >
                  {p.rating}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y1 = useTransform(scrollYProgress, [0, 1], [30, -30]);
  const y2 = useTransform(scrollYProgress, [0, 1], [60, -10]);
  const y3 = useTransform(scrollYProgress, [0, 1], [20, -50]);

  return (
    <section id="demo" ref={ref} className="relative py-32 overflow-hidden" style={{ backgroundColor: BG }}>
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${CARD_BORDER}, transparent)` }}
      />

      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full blur-[150px] opacity-[0.06]"
        style={{ backgroundColor: AMBER }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <InViewSection>
          <motion.div variants={fadeUp} className="text-center mb-16">
            <span
              className={`${inter.className} text-xs uppercase tracking-[0.15em] mb-4 block`}
              style={{ color: AMBER }}
            >
              Interface
            </span>
            <h2 className={`${syne.className} text-4xl sm:text-5xl font-700 text-white`}>
              Conçu pour le terrain,
              <br />
              <span className="text-white/40">pensé pour le staff.</span>
            </h2>
          </motion.div>
        </InViewSection>

        {/* 3 mockup panels */}
        <div className="grid lg:grid-cols-3 gap-5 items-start">
          <motion.div style={{ y: y1 }} className="lg:mt-8">
            <InViewSection>
              <motion.div variants={fadeUp}>
                <div
                  className={`${inter.className} text-xs text-white/35 mb-3 flex items-center gap-2`}
                >
                  <Target size={11} style={{ color: AMBER }} />
                  Schémas tactiques
                </div>
                <TacticalMockup />
              </motion.div>
            </InViewSection>
          </motion.div>

          <motion.div style={{ y: y2 }}>
            <InViewSection>
              <motion.div variants={fadeUp}>
                <div
                  className={`${inter.className} text-xs text-white/35 mb-3 flex items-center gap-2`}
                >
                  <BookOpen size={11} style={{ color: '#60A5FA' }} />
                  Planification de séances
                </div>
                <SessionPlannerMockup />
              </motion.div>
            </InViewSection>
          </motion.div>

          <motion.div style={{ y: y3 }} className="lg:mt-16">
            <InViewSection>
              <motion.div variants={fadeUp}>
                <div
                  className={`${inter.className} text-xs text-white/35 mb-3 flex items-center gap-2`}
                >
                  <BarChart2 size={11} style={{ color: '#34D399' }} />
                  Analyse de matchs
                </div>
                <MatchStatsMockup />
              </motion.div>
            </InViewSection>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ────────────────────────────────────────────────── */
const PLANS = [
  {
    name: 'Coach Solo',
    price: '0',
    period: '/mois',
    desc: 'Démarrez sans frais. Tout ce qu\'il faut pour un coach indépendant.',
    cta: 'Commencer gratuitement',
    features: [
      '1 équipe',
      'Schémas tactiques (5 max)',
      'Suivi de 3 matchs/mois',
      'Bibliothèque exercices',
      'App mobile incluse',
    ],
    highlight: false,
  },
  {
    name: 'Coach Pro',
    price: '12',
    period: '/mois',
    desc: 'Pour les coachs sérieux qui veulent passer au niveau supérieur.',
    cta: 'Essayer 14 jours',
    features: [
      '3 équipes',
      'Schémas illimités + animations',
      'Matchs illimités + stats avancées',
      'Bibliothèque complète',
      'Profils joueurs détaillés',
      'Support prioritaire',
    ],
    highlight: true,
  },
  {
    name: 'Club Elite',
    price: '29',
    period: '/mois',
    desc: 'Pour les clubs avec plusieurs équipes et un staff complet.',
    cta: 'Contacter l\'équipe',
    features: [
      'Équipes illimitées',
      'Gestion multi-staff',
      'Analytics club complets',
      'Export PDF & partage',
      'Intégration calendrier',
      'Support dédié 24/7',
    ],
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="relative py-32" style={{ backgroundColor: BG }}>
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${CARD_BORDER}, transparent)` }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <InViewSection>
          <motion.div variants={fadeUp} className="text-center mb-16">
            <span
              className={`${inter.className} text-xs uppercase tracking-[0.15em] mb-4 block`}
              style={{ color: AMBER }}
            >
              Tarifs
            </span>
            <h2 className={`${syne.className} text-4xl sm:text-5xl font-700 text-white`}>
              Transparent, sans surprise.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5 items-center">
            {PLANS.map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                custom={i * 0.5}
                whileHover={{ y: plan.highlight ? -4 : -6 }}
                transition={{ duration: 0.2 }}
                className="relative rounded-2xl p-7"
                style={
                  plan.highlight
                    ? {
                        backgroundColor: 'rgba(255,176,32,0.05)',
                        border: `1px solid ${AMBER}40`,
                        boxShadow: `0 0 60px ${AMBER}15`,
                        transform: 'scale(1.02)',
                      }
                    : {
                        backgroundColor: CARD_BG,
                        border: `1px solid ${CARD_BORDER}`,
                      }
                }
              >
                {plan.highlight && (
                  <div
                    className={`${inter.className} text-[10px] font-500 uppercase tracking-widest px-3 py-1 rounded-full mb-5 inline-block`}
                    style={{ backgroundColor: `${AMBER}20`, color: AMBER, border: `1px solid ${AMBER}40` }}
                  >
                    Le plus populaire
                  </div>
                )}

                <h3
                  className={`${syne.className} text-xl font-700 mb-1`}
                  style={{ color: plan.highlight ? AMBER : 'white' }}
                >
                  {plan.name}
                </h3>
                <p className={`${inter.className} text-xs text-white/40 mb-6 leading-relaxed`}>
                  {plan.desc}
                </p>

                <div className="flex items-baseline gap-1 mb-7">
                  <span className={`${syne.className} text-5xl font-800 text-white`}>€{plan.price}</span>
                  <span className={`${inter.className} text-sm text-white/40`}>{plan.period}</span>
                </div>

                <Link
                  href="/signup"
                  className={`${inter.className} block text-center text-sm font-500 py-2.5 px-5 rounded-full mb-7 transition-all`}
                  style={
                    plan.highlight
                      ? { backgroundColor: AMBER, color: '#0E0E10' }
                      : { backgroundColor: 'rgba(255,255,255,0.07)', color: 'white', border: `1px solid ${CARD_BORDER}` }
                  }
                >
                  {plan.cta}
                </Link>

                <div
                  className="w-full h-px mb-6"
                  style={{ backgroundColor: plan.highlight ? `${AMBER}20` : CARD_BORDER }}
                />

                <ul className="space-y-3">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <Check
                        size={13}
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: plan.highlight ? AMBER : 'rgba(255,255,255,0.3)' }}
                      />
                      <span className={`${inter.className} text-sm text-white/55`}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </InViewSection>
      </div>
    </section>
  );
}

/* ─── FAQ ────────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  {
    q: 'FutsalHub fonctionne-t-il hors ligne ?',
    a: 'L\'application mobile permet de consulter vos séances et schémas sans connexion. Les modifications sont synchronisées automatiquement dès que vous retrouvez du réseau.',
  },
  {
    q: 'Puis-je importer mes séances existantes ?',
    a: 'Oui, FutsalHub supporte l\'import depuis un fichier CSV ou Excel pour vos exercices et séances. Notre équipe peut vous accompagner dans la migration.',
  },
  {
    q: 'Y a-t-il une limite au nombre de joueurs dans mon effectif ?',
    a: 'Aucune limite. Même en version gratuite, vous pouvez gérer un effectif complet. Le plan Coach Solo est limité à 1 équipe, pas au nombre de joueurs.',
  },
  {
    q: 'Les schémas tactiques sont-ils partageables avec les joueurs ?',
    a: 'Absolument. Vous pouvez générer un lien de partage ou exporter en PDF/vidéo pour envoyer directement à vos joueurs via WhatsApp ou email.',
  },
  {
    q: 'Comment fonctionne la période d\'essai ?',
    a: 'Le plan Coach Pro est essayable 14 jours sans carte bancaire. À la fin de la période, vous basculez automatiquement sur le plan gratuit si vous ne souhaitez pas continuer.',
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-32" style={{ backgroundColor: BG }}>
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${CARD_BORDER}, transparent)` }}
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <InViewSection>
          <motion.div variants={fadeUp} className="text-center mb-16">
            <span
              className={`${inter.className} text-xs uppercase tracking-[0.15em] mb-4 block`}
              style={{ color: AMBER }}
            >
              FAQ
            </span>
            <h2 className={`${syne.className} text-4xl sm:text-5xl font-700 text-white`}>
              Des questions ?
            </h2>
          </motion.div>

          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                custom={i * 0.3}
                className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${open === i ? `${AMBER}30` : CARD_BORDER}` }}
              >
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                  style={{ backgroundColor: open === i ? `${AMBER}08` : 'rgba(255,255,255,0.02)' }}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className={`${syne.className} text-sm font-600 text-white pr-4`}>
                    {item.q}
                  </span>
                  <motion.div
                    animate={{ rotate: open === i ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown size={16} className="text-white/40" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-6 pb-4 border-t"
                        style={{ borderColor: `${AMBER}15` }}
                      >
                        <p className={`${inter.className} text-sm text-white/50 leading-relaxed pt-3`}>
                          {item.a}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </InViewSection>
      </div>
    </section>
  );
}

/* ─── CTA band ───────────────────────────────────────────────── */
function CTABand() {
  return (
    <section className="py-20" style={{ backgroundColor: BG }}>
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <InViewSection>
          <motion.div
            variants={fadeUp}
            className="relative rounded-3xl px-8 py-14 text-center overflow-hidden"
            style={{
              backgroundColor: `${AMBER}08`,
              border: `1px solid ${AMBER}25`,
            }}
          >
            {/* Background glow */}
            <div
              className="absolute inset-0 blur-3xl opacity-10"
              style={{ backgroundColor: AMBER }}
            />

            <div className="relative">
              <h2 className={`${syne.className} text-4xl sm:text-5xl font-800 text-white mb-4`}>
                Prêt à changer de niveau ?
              </h2>
              <p className={`${inter.className} text-white/50 mb-8 max-w-md mx-auto`}>
                Rejoignez 500+ coachs qui utilisent FutsalHub pour structurer leur staff et améliorer leurs résultats.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className={`${inter.className} inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-500 text-sm`}
                  style={{ backgroundColor: AMBER, color: '#0E0E10' }}
                >
                  Commencer gratuitement
                  <ArrowRight size={15} />
                </Link>
                <a
                  href="#demo"
                  className={`${inter.className} inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-500 text-sm text-white/60`}
                  style={{ border: `1px solid ${CARD_BORDER}` }}
                >
                  Voir la démo
                </a>
              </div>
            </div>
          </motion.div>
        </InViewSection>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer
      className="border-t pt-16 pb-8"
      style={{ backgroundColor: BG, borderColor: CARD_BORDER }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: AMBER, boxShadow: `0 0 8px ${AMBER}` }}
              />
              <span className={`${syne.className} text-white font-700 text-lg`}>FutsalHub</span>
            </div>
            <p className={`${inter.className} text-sm text-white/35 leading-relaxed max-w-xs`}>
              La plateforme digitale conçue pour les coachs de futsal qui veulent structurer leur staff et gagner en efficacité.
            </p>
            <div className="flex gap-4 mt-6">
              {[Twitter, Instagram, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="text-white/30 hover:text-white transition-colors"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Produit */}
          <div>
            <h4 className={`${syne.className} text-xs font-700 text-white/60 uppercase tracking-widest mb-4`}>
              Produit
            </h4>
            <ul className={`${inter.className} space-y-3 text-sm text-white/35`}>
              {['Fonctionnalités', 'Tarifs', 'Roadmap', 'Changelog'].map((l) => (
                <li key={l}>
                  <a href="#" className="hover:text-white transition-colors">{l}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className={`${syne.className} text-xs font-700 text-white/60 uppercase tracking-widest mb-4`}>
              Légal
            </h4>
            <ul className={`${inter.className} space-y-3 text-sm text-white/35`}>
              {['Mentions légales', 'CGU', 'Politique de confidentialité', 'Contact'].map((l) => (
                <li key={l}>
                  <a href="#" className="hover:text-white transition-colors">{l}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderColor: CARD_BORDER }}
        >
          <span className={`${inter.className} text-xs text-white/25`}>
            © {new Date().getFullYear()} FutsalHub. Tous droits réservés.
          </span>
          <span className={`${inter.className} text-xs text-white/20`}>
            Fait avec passion pour le futsal 🟡
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div
      className={`${syne.variable} ${inter.variable}`}
      style={{ backgroundColor: BG, minHeight: '100vh' }}
    >
      <GrainOverlay />
      <Navbar />
      <Hero />
      <Features />
      <StatsBand />
      <DemoSection />
      <Pricing />
      <FAQ />
      <CTABand />
      <Footer />
    </div>
  );
}
