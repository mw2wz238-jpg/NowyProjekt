import * as THREE from 'three';

class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private externalTextureLoads = new Set<string>();
  private maxAnisotropy = 1;

  public setAnisotropy(value: number): void {
    this.maxAnisotropy = Math.max(1, value);
  }

  private loadPolyhavenAsphalt(material: THREE.MeshStandardMaterial): void {
    if (this.externalTextureLoads.has('asphalt_05')) return;
    this.externalTextureLoads.add('asphalt_05');
    const loader = new THREE.TextureLoader();
    const basePath = '/assets/polyhaven/asphalt_05/';
    Promise.all([
      loader.loadAsync(`${basePath}asphalt_05_diff_2k.jpg`),
      loader.loadAsync(`${basePath}asphalt_05_nor_gl_2k.jpg`),
      loader.loadAsync(`${basePath}asphalt_05_arm_2k.jpg`),
    ]).then(([colorMap, normalMap, armMap]) => {
      const previousMaps = new Set([
        material.map,
        material.normalMap,
        material.roughnessMap,
      ].filter((texture): texture is THREE.Texture => texture !== null));
      for (const texture of [colorMap, normalMap, armMap]) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(32, 32);
        texture.anisotropy = this.maxAnisotropy;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
      }
      colorMap.colorSpace = THREE.SRGBColorSpace;
      normalMap.colorSpace = THREE.NoColorSpace;
      armMap.colorSpace = THREE.NoColorSpace;
      material.map = colorMap;
      material.normalMap = normalMap;
      material.normalScale.set(0.42, 0.42);
      material.roughnessMap = armMap;
      material.metalnessMap = armMap;
      material.roughness = 0.55;
      material.metalness = 0.12;
      material.color.setHex(0x777d83);
      material.needsUpdate = true;
      for (const texture of previousMaps) texture.dispose();
    }).catch(() => this.externalTextureLoads.delete('asphalt_05'));
  }

  private createDetailMaps(source: THREE.CanvasTexture, strength: number): {
    normalMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const sourceCanvas = source.image as HTMLCanvasElement;
    const { width, height } = sourceCanvas;
    const sourceContext = sourceCanvas.getContext('2d')!;
    const sourcePixels = sourceContext.getImageData(0, 0, width, height).data;
    const normalCanvas = document.createElement('canvas');
    const roughnessCanvas = document.createElement('canvas');
    normalCanvas.width = roughnessCanvas.width = width;
    normalCanvas.height = roughnessCanvas.height = height;
    const normalContext = normalCanvas.getContext('2d')!;
    const roughnessContext = roughnessCanvas.getContext('2d')!;
    const normalPixels = normalContext.createImageData(width, height);
    const roughnessPixels = roughnessContext.createImageData(width, height);
    const luminanceAt = (x: number, y: number) => {
      const index = ((y + height) % height * width + (x + width) % width) * 4;
      return (sourcePixels[index] * 0.299 + sourcePixels[index + 1] * 0.587 + sourcePixels[index + 2] * 0.114) / 255;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const dx = (luminanceAt(x + 1, y) - luminanceAt(x - 1, y)) * strength;
        const dy = (luminanceAt(x, y + 1) - luminanceAt(x, y - 1)) * strength;
        const inverseLength = 1 / Math.hypot(dx, dy, 1);
        normalPixels.data[index] = (0.5 - dx * inverseLength * 0.5) * 255;
        normalPixels.data[index + 1] = (0.5 - dy * inverseLength * 0.5) * 255;
        normalPixels.data[index + 2] = (0.5 + inverseLength * 0.5) * 255;
        normalPixels.data[index + 3] = 255;

        const luminance = luminanceAt(x, y);
        const roughness = Math.round((0.78 - luminance * 0.24) * 255);
        roughnessPixels.data[index] = roughness;
        roughnessPixels.data[index + 1] = roughness;
        roughnessPixels.data[index + 2] = roughness;
        roughnessPixels.data[index + 3] = 255;
      }
    }

    normalContext.putImageData(normalPixels, 0, 0);
    roughnessContext.putImageData(roughnessPixels, 0, 0);
    const normalMap = new THREE.CanvasTexture(normalCanvas);
    const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
    for (const texture of [normalMap, roughnessMap]) {
      texture.wrapS = source.wrapS;
      texture.wrapT = source.wrapT;
      texture.repeat.copy(source.repeat);
      texture.anisotropy = this.maxAnisotropy;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
    normalMap.colorSpace = THREE.NoColorSpace;
    roughnessMap.colorSpace = THREE.NoColorSpace;
    return { normalMap, roughnessMap };
  }

  // Procedural canvas textures
  private createNoiseTexture(width: number, height: number, type: 'concrete' | 'rust' | 'camo_desert' | 'camo_arctic' | 'asphalt' | 'snow' | 'steel'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    if (type === 'concrete') {
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 48; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = 12 + Math.random() * 54;
        const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
        stain.addColorStop(0, 'rgba(22,25,28,0.22)');
        stain.addColorStop(1, 'rgba(22,25,28,0)');
        ctx.fillStyle = stain;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      for (let i = 0; i < 14000; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const gray = Math.floor(60 + Math.random() * 50);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(x, y, 1, 1);
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
    } else if (type === 'snow') {
      ctx.fillStyle = '#dce5ed';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 2200; i++) {
        const shade = Math.random() > 0.55 ? '#f7faff' : '#bac9d6';
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = 1 + Math.random() * 3;
        ctx.fillStyle = shade;
        ctx.globalAlpha = 0.12 + Math.random() * 0.32;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
    } else if (type === 'steel') {
      ctx.fillStyle = '#d18a24';
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#22262a';
      for (let x = -width; x < width; x += 84) {
        ctx.fillRect(x, -height, 34, height * 2);
      }
      ctx.restore();
      for (let i = 0; i < 1800; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,225,155,0.36)' : 'rgba(48,39,29,0.3)';
        ctx.fillRect(x, y, 1 + Math.random() * 8, 1);
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
    tex.anisotropy = this.maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  public get(name: string): THREE.Material {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    let mat: THREE.Material;

    switch (name) {
      case 'asphalt_wet': {
        const tex = this.createNoiseTexture(1024, 1024, 'asphalt');
        tex.repeat.set(16, 16);
        const details = this.createDetailMaps(tex, 3.5);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: details.normalMap,
          normalScale: new THREE.Vector2(0.32, 0.32),
          roughnessMap: details.roughnessMap,
          roughness: 0.38,
          metalness: 0.15,
        });
        this.loadPolyhavenAsphalt(mat as THREE.MeshStandardMaterial);
        break;
      }

      case 'snow_ground': {
        const tex = this.createNoiseTexture(1024, 1024, 'snow');
        tex.repeat.set(10, 10);
        const details = this.createDetailMaps(tex, 1.8);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: details.normalMap,
          normalScale: new THREE.Vector2(0.08, 0.08),
          roughnessMap: details.roughnessMap,
          roughness: 0.88,
          metalness: 0.02,
        });
        break;
      }

      case 'concrete_floor': {
        const tex = this.createNoiseTexture(1024, 1024, 'concrete');
        tex.repeat.set(12, 12);
        const details = this.createDetailMaps(tex, 2.4);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: details.normalMap,
          normalScale: new THREE.Vector2(0.22, 0.22),
          roughnessMap: details.roughnessMap,
          roughness: 0.65,
          metalness: 0.1,
        });
        break;
      }

      case 'container_rust': {
        const tex = this.createNoiseTexture(1024, 1024, 'rust');
        tex.repeat.set(4, 2);
        const details = this.createDetailMaps(tex, 4.5);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: details.normalMap,
          normalScale: new THREE.Vector2(0.2, 0.2),
          roughnessMap: details.roughnessMap,
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

      case 'container_rib': {
        mat = new THREE.MeshStandardMaterial({
          color: 0x48525a,
          roughness: 0.42,
          metalness: 0.78,
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
        const tex = this.createNoiseTexture(512, 512, 'steel');
        tex.repeat.set(2, 1);
        const details = this.createDetailMaps(tex, 2.2);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: details.normalMap,
          normalScale: new THREE.Vector2(0.08, 0.08),
          roughnessMap: details.roughnessMap,
          roughness: 0.46,
          metalness: 0.7,
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
