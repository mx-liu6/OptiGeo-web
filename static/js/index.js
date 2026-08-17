window.HELP_IMPROVE_VIDEOJS = false;

// Point cloud render
// 点云渲染相关变量和函数
var pointCloudScenes = {};
var pointCloudRenderers = {};
var pointCloudCameras = {};
var pointCloudControls = {};

// 初始化点云渲染器
function initPointCloudRenderer(containerId) {
  if (!document.getElementById(containerId)) {
    console.error("点云容器不存在:", containerId);
    return;
  }
  
  if (typeof THREE === 'undefined') {
    console.error("THREE.js 未加载");
    return;
  }
  
  const container = document.getElementById(containerId);
  
  // 创建场景
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(
    75, 
    container.clientWidth / container.clientHeight, 
    0.1, 
    1000
  );
  camera.position.set(0, 0, 5);
  
  // 创建渲染器
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  
  // 添加轨道控制
  let controls;
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
  } else {
    console.warn("OrbitControls 未加载，将使用基本旋转");
  }
  
  // 添加光源
  const ambientLight = new THREE.AmbientLight(0x606060);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // 存储场景、渲染器、相机和控制器引用
  pointCloudScenes[containerId] = scene;
  pointCloudRenderers[containerId] = renderer;
  pointCloudCameras[containerId] = camera;
  pointCloudControls[containerId] = controls;
  
  // 渲染循环
  function animate() {
    requestAnimationFrame(animate);
    if (controls) {
      controls.update();
    }
    renderer.render(scene, camera);
  }
  animate();
  
  // 窗口大小变化时调整
  function onResize() {
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  
  window.addEventListener('resize', onResize);
  
  return {
    scene: scene,
    camera: camera,
    renderer: renderer,
    controls: controls
  };
}

// 加载PLY点云文件
function loadPLYPointCloud(containerId, plyFilePath) {
  if (!pointCloudScenes[containerId]) {
    console.error("点云容器未初始化:", containerId);
    return;
  }
  
  const scene = pointCloudScenes[containerId];
  
  // 创建PLY加载器
  if (typeof THREE.PLYLoader === 'undefined') {
    console.error("PLYLoader 未加载");
    return;
  }
  const loader = new THREE.PLYLoader();
  
  // 加载PLY文件
  loader.load(
    plyFilePath,
    function(geometry) {
      // 清除场景中可能存在的旧点云（在新点云加载完成后再移除，避免闪屏）
      scene.children.forEach(child => {
        if (child instanceof THREE.Points) {
          scene.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
      });

      // 处理几何体，添加顶点颜色属性
      if (!geometry.hasAttribute('color')) {
        // 如果PLY文件没有颜色信息，则使用基于位置的颜色
        const positions = geometry.getAttribute('position');
        const colors = new Float32Array(positions.count * 3);
        
        for (let i = 0; i < positions.count; i++) {
          // 归一化坐标到[0,1]范围
          const x = (positions.getX(i) / 5) + 0.5;
          const y = (positions.getY(i) / 5) + 0.5;
          const z = (positions.getZ(i) / 5) + 0.5;
          
          // 使用坐标作为RGB颜色
          colors[i * 3] = x;
          colors[i * 3 + 1] = y;
          colors[i * 3 + 2] = z;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      
      // 创建点云材质
      const material = new THREE.PointsMaterial({
        size: 0.02,
        vertexColors: true
      });
      
      // 创建点云对象
      const pointCloud = new THREE.Points(geometry, material);
      
      // 调整点云位置，使其居中
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      pointCloud.position.set(-center.x, -center.y, -center.z);
      
      // 添加到场景
      scene.add(pointCloud);
      
      // 自动调整相机位置以适应点云
      const camera = pointCloudCameras[containerId];
      const controls = pointCloudControls[containerId];
      
      if (camera && controls) {
        const box = new THREE.Box3().setFromObject(pointCloud);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = maxDim / (2 * Math.tan(fov / 2));
        
        // 保存初始相机位置
        const initialY = -cameraDistance * 0.05;
        const initialZ = cameraDistance * 1.1;
        camera.position.set(0, initialY, initialZ);
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        controls.target.set(0, 0, 0);
        controls.update();
        
        // 自动水平旋转动画（来回摆动）
        let startTime = null;
        const animationDuration = 3000; // 3秒
        const maxRotation = Math.PI / 12; // 30度
        
        function autoRotate(timestamp) {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const progress = Math.min(elapsed / animationDuration, 1);
          
          if (progress < 1) {
            // 使用正弦函数创建来回摆动效果
            const rotationAngle = Math.sin(progress * Math.PI * 2) * maxRotation;
            
            // 更新相机位置（围绕Y轴旋转）
            const x = Math.sin(rotationAngle) * initialZ;
            const z = Math.cos(rotationAngle) * initialZ;
            camera.position.set(x, initialY, z);
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            controls.target.set(0, 0, 0);
            controls.update();
            
            requestAnimationFrame(autoRotate);
          } else {
            // 动画结束，回到初始位置
            camera.position.set(0, initialY, initialZ);
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            controls.target.set(0, 0, 0);
            controls.update();
          }
        }
        
        // 延迟一点开始动画，让点云先显示
        setTimeout(() => {
          requestAnimationFrame(autoRotate);
        }, 300);
      }
    },
    function(xhr) {
      // 加载进度
      console.log((xhr.loaded / xhr.total * 100) + '% 已加载');
    },
    function(error) {
      // 加载错误
      console.error('加载PLY文件出错:', error);
    }
  );
}

// 初始化主点云容器
function initMainPointCloud() {
  if (typeof THREE === 'undefined') {
    console.error("THREE.js 未加载，无法初始化点云");
    return;
  }
  
  const container = document.getElementById('pointcloud-container-main');
  if (!container) {
    console.error("主点云容器不存在");
    return;
  }
  
  const plyPath = container.getAttribute('data-ply-path');
  if (plyPath) {
    // 初始化渲染器
    initPointCloudRenderer('pointcloud-container-main');
    // 加载默认点云
    loadPLYPointCloud('pointcloud-container-main', plyPath);
  }
}

// 初始化缩略图点击事件
function initThumbnailClickHandlers() {
  const thumbnails = document.querySelectorAll('.thumbnail-item');
  
  thumbnails.forEach(thumbnail => {
    thumbnail.addEventListener('click', function() {
      const plyPath = this.getAttribute('data-ply');
      const name = this.getAttribute('data-name');
      
      // 更新主容器的路径
      const mainContainer = document.getElementById('pointcloud-container-main');
      if (mainContainer) {
        mainContainer.setAttribute('data-ply-path', plyPath);
        // 加载新的点云
        loadPLYPointCloud('pointcloud-container-main', plyPath);
      }
      
      // 更新选中状态
      thumbnails.forEach(t => {
        t.style.borderColor = '#ddd';
        t.style.opacity = '0.7';
      });
      this.style.borderColor = '#3273dc';
      this.style.opacity = '1';
    });
    
    // 鼠标悬停效果
    thumbnail.addEventListener('mouseenter', function() {
      if (this.style.borderColor !== 'rgb(50, 115, 220)') {
        this.style.opacity = '1';
      }
    });
    thumbnail.addEventListener('mouseleave', function() {
      if (this.style.borderColor !== 'rgb(50, 115, 220)') {
        this.style.opacity = '0.7';
      }
    });
  });
  
  // 默认选中第一个
  if (thumbnails.length > 0) {
    thumbnails[0].style.borderColor = '#3273dc';
    thumbnails[0].style.opacity = '1';
  }
}

$(document).ready(function() {
    // Check for click events on the navbar burger icon

    var options = {
			slidesToScroll: 1,
			slidesToShow: 1,
			loop: true,
			infinite: true,
			autoplay: true,
			autoplaySpeed: 5000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);
	
    bulmaSlider.attach();

    // 初始化主点云
    setTimeout(function() {
      initMainPointCloud();
      initThumbnailClickHandlers();
    }, 500); // 延迟加载，确保DOM已完全渲染
})
