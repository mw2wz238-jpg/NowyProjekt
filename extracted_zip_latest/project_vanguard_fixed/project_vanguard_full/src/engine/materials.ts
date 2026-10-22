import * as THREE from 'three';

class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();

  // Procedural canvas textures
  private createNoiseTexture(width: number, height: number, type: 'concrete' | 'rust' | 'camo_desert' | 'camo_arctic' | 'asphalt'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    if (type === 'concrete') {
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 4000; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const gray = Math.floor(60 + Math.random() * 50);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (type === 'asphalt') {
      ctx.fillStyle = '#22252a';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 6000; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const gray = Math.floor(25 + Math.random() * 35);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      // Puddle streaks
      ctx.fillStyle = 'rgba(15, 18, 22, 0.4)';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 20 + Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'rust') {
      ctx.fillStyle = '#2d4b68'; // Industrial blue container
      ctx.fillRect(0, 0, width, height);
      // Corrugation stripes
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < width; x += 16) {
        ctx.fillRect(x, 0, 8, height);
      }
      // Rust spots
      for (let i = 0; i < 60; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rRad = 4 + Math.random() * 18;
        const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rRad);
        grad.addColorStop(0, '#7c3818');
        grad.addColorStop(0.6, '#a85024');
        grad.addColorStop(1, 'rgba(168,80,36,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, rRad, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'camo_desert') {
      ctx.fillStyle = '#c2a878';
      ctx.fillRect(0, 0, width, height);
      const colors = ['#8f7347', '#5e4e32', '#d9cbb2'];
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(Math.random() * width, Math.random() * height, 15 + Math.random() * 35, 10 + Math.random() * 25, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'camo_arctic') {
      ctx.fillStyle = '#dde2e8';
      ctx.fillRect(0, 0, width, height);
      const colors = ['#8fa0b0', '#4e5a66', '#ffffff'];
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(Math.random() * width, Math.random() * height, 15 + Math.random() * 30, 10 + Math.random() * 25, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  public get(name: string): THREE.Material {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    let mat: THREE.Material;

    switch (name) {
      case 'asphalt_wet': {
        const tex = this.createNoiseTexture(512, 512, 'asphalt');
        tex.repeat.set(16, 16);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.28,
          metalness: 0.15,
        });
        break;
      }

      case 'snow_ground': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xe8eef5,
          roughness: 0.85,
          metalness: 0.05,
        });
        break;
      }

      case 'concrete_floor': {
        const tex = this.createNoiseTexture(512, 512, 'concrete');
        tex.repeat.set(12, 12);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.65,
          metalness: 0.1,
        });
        break;
      }

      case 'container_rust': {
        const tex = this.createNoiseTexture(256, 256, 'rust');
        tex.repeat.set(4, 2);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.6,
          metalness: 0.75,
        });
        break;
      }

      case 'container_orange': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xba451c,
          roughness: 0.5,
          metalness: 0.6,
        });
        break;
      }

      case 'container_green': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x1f5438,
          roughness: 0.5,
          metalness: 0.6,
        });
        break;
      }

      case 'steel_girder': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd9821e, // Industrial yellow/orange crane steel
          roughness: 0.4,
          metalness: 0.85,
        });
        break;
      }

      case 'weapon_matte_black': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x181a1c,
          roughness: 0.35,
          metalness: 0.7,
        });
        break;
      }

      case 'weapon_metal_blued': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x242830,
          roughness: 0.22,
          metalness: 0.95,
        });
        break;
      }

      case 'weapon_camo_desert': {
        const tex = this.createNoiseTexture(256, 256, 'camo_desert');
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.4,
          metalness: 0.3,
        });
        break;
      }

      case 'weapon_camo_arctic': {
        const tex = this.createNoiseTexture(256, 256, 'camo_arctic');
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.4,
          metalness: 0.3,
        });
        break;
      }

      case 'weapon_gold_elite': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          roughness: 0.18,
          metalness: 0.98,
        });
        break;
      }

      case 'optic_glass': {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x88ccff,
          transparent: true,
          opacity: 0.45,
          roughness: 0.05,
          metalness: 0.1,
          transmission: 0.8,
          thickness: 0.02,
        });
        break;
      }

      case 'reticle_red': {
        mat = new THREE.MeshBasicMaterial({
          color: 0xff1122,
          toneMapped: false,
        });
        break;
      }

      case 'reticle_green': {
        mat = new THREE.MeshBasicMaterial({
          color: 0x00ff66,
          toneMapped: false,
        });
        break;
      }

      case 'operative_blue': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x1d2e47, // Vanguard Navy / Slate
          roughness: 0.75,
          metalness: 0.1,
        });
        break;
      }

      case 'operative_red': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x4a1818, // Syndicate Dark Maroon / Crimson
          roughness: 0.75,
          metalness: 0.1,
        });
        break;
      }

      case 'tactical_vest': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x111316,
          roughness: 0.6,
          metalness: 0.3,
        });
        break;
      }

      case 'operative_skin': {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd29d78,
          roughness: 0.6,
          metalness: 0.0,
        });
        break;
      }

      case 'operative_glove': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x16181b,
          roughness: 0.5,
          metalness: 0.2,
        });
        break;
      }

      case 'bullet_decal': {
        mat = new THREE.MeshBasicMaterial({
          color: 0x0a0c0e,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        break;
      }

      default: {
        mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
      }
    }

    this.cache.set(name, mat);
    return mat;
  }

  public isShared(material: THREE.Material): boolean {
    for (const cachedMaterial of this.cache.values()) {
      if (cachedMaterial === material) return true;
    }
    return false;
  }
}

export const Materials = new MaterialLibrary();
