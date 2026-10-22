import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WeaponAttachmentConfig, WeaponStats } from '../types/game';
import { WeaponModelBuilder } from '../engine/weapons';
import { Materials } from '../engine/materials';
import { disposeObjectResources } from '../engine/resourceDisposal';
import { X, Check, Sliders } from 'lucide-react';

interface GunsmithModalProps {
  currentWeapon: WeaponStats;
  currentAttachments: WeaponAttachmentConfig;
  onApplyAttachments: (attachments: WeaponAttachmentConfig) => void;
  onClose: () => void;
}

export const GunsmithModal: React.FC<GunsmithModalProps> = ({
  currentWeapon,
  currentAttachments,
  onApplyAttachments,
  onClose,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<WeaponAttachmentConfig>({ ...currentAttachments });
  const [activeSlot, setActiveSlot] = useState<'sight' | 'barrel' | 'magazine' | 'stock' | 'grip' | 'camo'>('sight');

  // Three.js Turntable Preview
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const weaponMeshRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;
    const width = mountNode.clientWidth;
    const height = mountNode.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0f14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 0.85);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Lighting Rig for Gunsmith
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.2);
    keyLight.position.set(3, 4, 3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7fb3d5, 1.8);
    rimLight.position.set(-3, -2, -3);
    scene.add(rimLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambLight);

    // Initial weapon
    let animId = 0;
    let rotY = 0;
    const animate = () => {
      rotY += 0.005;
      if (weaponMeshRef.current) {
        weaponMeshRef.current.rotation.y = rotY;
      }
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!rendererRef.current) return;
      const w = mountNode.clientWidth;
      const h = mountNode.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (weaponMeshRef.current) {
        scene.remove(weaponMeshRef.current);
        disposeObjectResources([weaponMeshRef.current], (material) => Materials.isShared(material));
        weaponMeshRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
      if (sceneRef.current === scene) sceneRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  // Rebuild preview mesh whenever attachments change
  useEffect(() => {
    if (!sceneRef.current) return;
    if (weaponMeshRef.current) {
      sceneRef.current.remove(weaponMeshRef.current);
      disposeObjectResources([weaponMeshRef.current], (material) => Materials.isShared(material));
    }
    const newMesh = WeaponModelBuilder.buildProceduralWeapon(currentWeapon.id, attachments, false);
    sceneRef.current.add(newMesh);
    weaponMeshRef.current = newMesh;
  }, [currentWeapon.id, attachments]);

  // Dynamic calculated stats
  const damage = currentWeapon.damage + (attachments.barrel === 'heavy_long' ? 4 : attachments.barrel === 'suppressed' ? -2 : 0);
  const range = currentWeapon.rangeMeters + (attachments.sight === 'acog_scope' ? 45 : attachments.barrel === 'heavy_long' ? 25 : 0);
  const fireRate = currentWeapon.fireRateRPM + (attachments.magazine === 'drum' ? -35 : 0);
  const recoilControl = 75 + (attachments.stock === 'heavy' ? 15 : 0) + (attachments.grip === 'vertical' ? 12 : 0);
  const mobility = 80 + (attachments.stock === 'lightweight' ? 15 : 0) - (attachments.magazine === 'drum' ? 18 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md font-sans text-white p-6">
      <div className="relative w-full max-w-6xl h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-black tracking-widest text-white uppercase">
              RUSZNIKARZ • MODYFIKACJA UZBROJENIA: {currentWeapon.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main 3D Viewport & Options */}
        <div className="flex flex-1 overflow-hidden">
          {/* 3D Turntable Center Area */}
          <div className="flex-1 relative bg-gradient-to-b from-zinc-900/30 to-zinc-950 flex flex-col">
            <div ref={mountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Bottom Slot Selector Pills */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 border border-zinc-700/80 p-2 rounded-xl backdrop-blur-md shadow-2xl">
              {(['sight', 'barrel', 'magazine', 'stock', 'grip', 'camo'] as const).map((slot) => {
                const labels: Record<string, string> = {
                  sight: 'CELOWNIK',
                  barrel: 'LUFA / TŁUMIK',
                  magazine: 'MAGAZYNEK',
                  stock: 'KOLBA',
                  grip: 'UCHWYT',
                  camo: 'KAMUFLAŻ',
                };
                return (
                  <button
                    key={slot}
                    onClick={() => setActiveSlot(slot)}
                    className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider transition-all cursor-pointer ${
                      activeSlot === slot
                        ? 'bg-amber-500 text-zinc-950 shadow-lg'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {labels[slot]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Slot Options & Stats */}
          <div className="w-96 border-l border-zinc-800 bg-zinc-900/40 p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <h3 className="text-sm font-black tracking-widest text-zinc-300 uppercase mb-4 pb-2 border-b border-zinc-800">
                WYBIERZ KOMPONENT
              </h3>

              {/* Dynamic options based on activeSlot */}
              <div className="flex flex-col gap-2.5">
                {activeSlot === 'sight' && (
                  <>
                    <OptionButton
                      label="Celownik Mechaniczny"
                      active={attachments.sight === 'ironsight'}
                      onClick={() => setAttachments({ ...attachments, sight: 'ironsight' })}
                    />
                    <OptionButton
                      label="Kolimator Red Dot Reflex"
                      active={attachments.sight === 'reddot'}
                      onClick={() => setAttachments({ ...attachments, sight: 'reddot' })}
                    />
                    <OptionButton
                      label="Holograficzny EOTech 552"
                      active={attachments.sight === 'holographic'}
                      onClick={() => setAttachments({ ...attachments, sight: 'holographic' })}
                    />
                    <OptionButton
                      label="Luneta ACOG 4x Precision"
                      active={attachments.sight === 'acog_scope'}
                      onClick={() => setAttachments({ ...attachments, sight: 'acog_scope' })}
                    />
                  </>
                )}

                {activeSlot === 'barrel' && (
                  <>
                    <OptionButton
                      label="Standardowa Lufa Wojskowa"
                      active={attachments.barrel === 'standard'}
                      onClick={() => setAttachments({ ...attachments, barrel: 'standard' })}
                    />
                    <OptionButton
                      label="Wytłumiona Lufa Silenced"
                      active={attachments.barrel === 'suppressed'}
                      onClick={() => setAttachments({ ...attachments, barrel: 'suppressed' })}
                    />
                    <OptionButton
                      label="Wydłużona Ciężka Lufa Snajperska"
                      active={attachments.barrel === 'heavy_long'}
                      onClick={() => setAttachments({ ...attachments, barrel: 'heavy_long' })}
                    />
                  </>
                )}

                {activeSlot === 'magazine' && (
                  <>
                    <OptionButton
                      label="Standardowy STANAG (30 Naboi)"
                      active={attachments.magazine === 'standard'}
                      onClick={() => setAttachments({ ...attachments, magazine: 'standard' })}
                    />
                    <OptionButton
                      label="Powiększony Magazynek (45 Naboi)"
                      active={attachments.magazine === 'extended'}
                      onClick={() => setAttachments({ ...attachments, magazine: 'extended' })}
                    />
                    <OptionButton
                      label="Bębnowy Magazynek Heavy Drum (60 Naboi)"
                      active={attachments.magazine === 'drum'}
                      onClick={() => setAttachments({ ...attachments, magazine: 'drum' })}
                    />
                  </>
                )}

                {activeSlot === 'stock' && (
                  <>
                    <OptionButton
                      label="Kolba Taktyczna Zbalansowana"
                      active={attachments.stock === 'tactical'}
                      onClick={() => setAttachments({ ...attachments, stock: 'tactical' })}
                    />
                    <OptionButton
                      label="Ciężka Kolba Precyzyjna (Mniej Odrzutu)"
                      active={attachments.stock === 'heavy'}
                      onClick={() => setAttachments({ ...attachments, stock: 'heavy' })}
                    />
                    <OptionButton
                      label="Lekka Kolba Skeleton (Wysoka Mobilność)"
                      active={attachments.stock === 'lightweight'}
                      onClick={() => setAttachments({ ...attachments, stock: 'lightweight' })}
                    />
                  </>
                )}

                {activeSlot === 'grip' && (
                  <>
                    <OptionButton
                      label="Brak Podwieszenia"
                      active={attachments.grip === 'none'}
                      onClick={() => setAttachments({ ...attachments, grip: 'none' })}
                    />
                    <OptionButton
                      label="Pionowy Chwyt Przedni Vertical Grip"
                      active={attachments.grip === 'vertical'}
                      onClick={() => setAttachments({ ...attachments, grip: 'vertical' })}
                    />
                    <OptionButton
                      label="Skośny Chwyt Kątowy Angled Foregrip"
                      active={attachments.grip === 'angled'}
                      onClick={() => setAttachments({ ...attachments, grip: 'angled' })}
                    />
                  </>
                )}

                {activeSlot === 'camo' && (
                  <>
                    <OptionButton
                      label="Czarny Mat Wojskowy (Military Black)"
                      active={attachments.camo === 'military_black'}
                      onClick={() => setAttachments({ ...attachments, camo: 'military_black' })}
                    />
                    <OptionButton
                      label="Kamuflaż Pustynny (Desert Tan)"
                      active={attachments.camo === 'desert_tan'}
                      onClick={() => setAttachments({ ...attachments, camo: 'desert_tan' })}
                    />
                    <OptionButton
                      label="Kamuflaż Zimowy (Arctic Snow)"
                      active={attachments.camo === 'arctic_snow'}
                      onClick={() => setAttachments({ ...attachments, camo: 'arctic_snow' })}
                    />
                    <OptionButton
                      label="Złoty Elitarny (Carbon Gold Elite)"
                      active={attachments.camo === 'carbon_gold'}
                      onClick={() => setAttachments({ ...attachments, camo: 'carbon_gold' })}
                    />
                  </>
                )}
              </div>

              {/* Weapon Stats Bars */}
              <div className="mt-8 flex flex-col gap-3">
                <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase">
                  CHARAKTERYSTYKA BALISTYCZNA
                </h4>
                <StatBar label="OBRAŻENIA" val={damage} max={120} />
                <StatBar label="ZASIĘG SKUTECZNY" val={range} max={300} unit="m" />
                <StatBar label="SZYBKOSTRZELNOŚĆ" val={fireRate} max={900} unit="RPM" />
                <StatBar label="KONTROLA ODRZUTU" val={recoilControl} max={100} unit="%" />
                <StatBar label="MOBILNOŚĆ" val={mobility} max={100} unit="%" />
              </div>
            </div>

            {/* Apply & Save button */}
            <button
              onClick={() => {
                onApplyAttachments(attachments);
                onClose();
              }}
              className="mt-6 w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              ZAPISZ I ZASTOSUJ MODYFIKACJĘ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const OptionButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
      active
        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
        : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
    }`}
  >
    {label}
  </button>
);

const StatBar: React.FC<{ label: string; val: number; max: number; unit?: string }> = ({
  label,
  val,
  max,
  unit = '',
}) => {
  const pct = Math.min(100, Math.max(0, (val / max) * 100));
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <div className="flex justify-between text-zinc-400 font-semibold">
        <span>{label}</span>
        <span className="text-white font-bold tabular-nums">
          {val} {unit}
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          style={{ width: `${pct}%` }}
          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-300"
        />
      </div>
    </div>
  );
};
