'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  Calendar,
  BarChart3,
  Search,
  Share2,
  User,
  Plus,
  Key,
  Users,
  Building2,
  Check,
  Mail,
  Twitter,
  Linkedin,
  Instagram,
  X
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });

      if (error) throw error;

      if (data.user) {
        // Connexion réussie
        setIsLoginModalOpen(false);
        router.push('/webapp'); // Redirection vers la webapp ou la page d'accueil connectée
      }
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors de la connexion');
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      title: 'Manager',
      description: 'Pilotage complet d\'une équipe (effectif, calendrier, séances, matchs)',
      icon: Calendar
    },
    {
      title: 'Tracker',
      description: 'Outil data pour matchs en live + analyses avancées',
      icon: BarChart3
    },
    {
      title: 'Scout',
      description: 'Plateforme de recrutement joueurs/staff',
      icon: Search
    },
    {
      title: 'Share',
      description: 'Librairie de contenus techniques + forum pour membres',
      icon: Share2
    }
  ];

  const pricingPlans = [
    {
      name: 'Free',
      price: '0€',
      icon: User,
      features: ['1 équipe', 'Statistiques basiques', 'Forum communautaire']
    },
    {
      name: 'Team',
      price: '9,99€',
      period: '/mois',
      icon: Users,
      features: ['3 équipes', 'Statistiques avancées', 'Analyse vidéo', 'Support prioritaire']
    },
    {
      name: 'Club',
      price: '19,99€',
      period: '/mois',
      icon: Building2,
      features: ['Équipes illimitées', 'Toutes les fonctionnalités', 'API personnalisée', 'Support dédié']
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-blue-600 hover:text-blue-700">
              FutsalHub
            </Link>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 flex items-center space-x-2"
              >
                <Key className="w-4 h-4" />
                <span>Login</span>
              </button>
              <Link
                href="/signup"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Sign Up</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg max-w-md w-full relative">
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold mb-6 text-center">Connexion</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={loginData.email}
                    onChange={handleLoginChange}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="password"
                    id="password"
                    value={loginData.password}
                    onChange={handleLoginChange}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <Link
                    href="/signup"
                    className="font-medium text-blue-600 hover:text-blue-500"
                    onClick={() => setIsLoginModalOpen(false)}
                  >
                    Pas encore de compte ?
                  </Link>
                </div>
                <div className="text-sm">
                  <Link
                    href="/forgot-password"
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-6">
              Donner aux coachs de futsal toute la puissance du digital
            </h1>
            <p className="text-xl sm:text-2xl mb-8">
              Pour améliorer l'impact sur leur équipe
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-3 bg-white text-blue-600 rounded-md font-semibold hover:bg-gray-100"
            >
              Commencer gratuitement
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Nos Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
                >
                  <div className="text-blue-600 mb-4">
                    <Icon className="w-12 h-12" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Nos Formules</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <div
                  key={index}
                  className="bg-white p-8 rounded-lg shadow-md hover:shadow-lg transition-shadow"
                >
                  <div className="text-blue-600 mb-4">
                    <Icon className="w-12 h-12" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-gray-600">{plan.period}</span>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center">
                        <Check className="h-5 w-5 text-green-500 mr-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button className="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Choisir {plan.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">FutsalHub</h3>
              <p className="text-gray-400">
                La plateforme digitale pour les coachs de futsal
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Liens utiles</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/mentions-legales" className="text-gray-400 hover:text-white">
                    Mentions légales
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-gray-400 hover:text-white">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Réseaux sociaux</h4>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <Twitter className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <Linkedin className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <Instagram className="w-5 h-5" />
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Newsletter</h4>
              <p className="text-gray-400 mb-4">
                Restez informé de nos actualités
              </p>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Votre email"
                  className="w-full px-4 py-2 rounded-l-md bg-gray-700 text-white"
                />
                <button className="px-4 py-2 bg-blue-600 rounded-r-md hover:bg-blue-700">
                  <Mail className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} FutsalHub. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
} 