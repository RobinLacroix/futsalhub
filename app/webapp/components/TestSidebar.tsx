'use client';

export default function TestSidebar() {
  return (
    <div className="fixed top-16 left-0 h-[calc(100vh-4rem)] bg-red-500 w-64 z-50">
      <div className="p-4 text-white text-center">
        <h1 className="text-2xl font-bold mb-4">🧪 TEST SIDEBAR</h1>
        <p className="text-lg">Si vous voyez ceci, nous modifions le bon endroit !</p>
        <div className="mt-4 p-3 bg-white text-red-500 rounded">
          <strong>Sélecteur d'équipe de test</strong>
        </div>
      </div>
    </div>
  );
}
