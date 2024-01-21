import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const controls = new OrbitControls( camera, renderer.domElement );

camera.position.set(0, 300, 5)
controls.update()

const loader = new FontLoader();

/*

loader.load('helvetiker_regular.typeface.json', function (font) {

	const geometry = new TextGeometry( 'Longitude', {
		font: font,
		size: 0.4,
        height: 0.05
	} );

    const textMaterial = new THREE.MeshBasicMaterial({color: 0xFFFFFF})
    const textMesh = new THREE.Mesh(geometry, textMaterial)

    textMesh.rotateX(-Math.PI / 2)
    textMesh.position.x = -2.3
    textMesh.position.z = -0.6

    scene.add(textMesh)

    const latGeometry = new TextGeometry('Latitude', {
        font: font,
        size: 0.4,
        height: 0.05
    })
    const latMesh = new THREE.Mesh(latGeometry, textMaterial)

    latMesh.rotateX(-Math.PI / 2)
    latMesh.rotateZ(-Math.PI / 2)
    latMesh.position.x = -3.5
    latMesh.position.z = 3

    scene.add(latMesh)

    const elevationGeometry = new TextGeometry('Elevation', {
        font: font,
        size: 0.4,
        height: 0.05
    })

    const elevationMesh = new THREE.Mesh(elevationGeometry, textMaterial)

    elevationMesh.rotateX(-Math.PI / 2)
    elevationMesh.rotateY(-Math.PI / 2)
    elevationMesh.position.x = -3.5

    scene.add(elevationMesh)
} );
*/

const spotlight = new THREE.SpotLight(0xffffff); // White light
spotlight.position.set(50, 0, 600); // Position the light above the scene
spotlight.castShadow = true;
scene.add(spotlight);

function calculateAverageElevations(geometry) {
    let elevations = new Float32Array(geometry.attributes.position.count);

    // Assuming geometry is indexed
    for (let i = 0; i < geometry.index.count; i += 3) {
        let a = geometry.index.array[i];
        let b = geometry.index.array[i + 1];
        let c = geometry.index.array[i + 2];

        let z1 = geometry.attributes.position.getZ(a);
        let z2 = geometry.attributes.position.getZ(b);
        let z3 = geometry.attributes.position.getZ(c);

        let avgZ = (z1 + z2 + z3) / 3;

        // Store the average elevation for each vertex
        elevations[a] = avgZ;
        elevations[b] = avgZ;
        elevations[c] = avgZ;
    }

    return elevations;
}

let averageElevation;

const fileLoader = new THREE.FileLoader();
fileLoader.load('elevations-2.json', function(data) {
    const elevations = JSON.parse(data);
    const terrainGeometry = new THREE.PlaneGeometry(700, 400, 350, 200);
    const positions = terrainGeometry.attributes.position; // Access the position attribute

    for (let i = 0; i < positions.count; i++) {
        positions.setZ(i, Math.round(elevations[i]) / 300); // Modify the Z-coordinate
    }

    positions.needsUpdate = true; // Important, to update the geometry

    averageElevation = calculateAverageElevations(terrainGeometry)
    terrainGeometry.setAttribute('averageElevation', new THREE.BufferAttribute(averageElevation, 1))

    var material = new THREE.ShaderMaterial( {
        vertexShader: document.getElementById( 'vertexShader' ).textContent,
        fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
        //lights: true
      } );
    
    const terrain = new THREE.Mesh(terrainGeometry, material);

    terrain.rotateX(-Math.PI / 2);

    terrain.receiveShadow = true;

    scene.add(terrain);
})



function getTemperatureColor(temp){
    const minTemp = 20
    const maxTemp = 100

    const clampedTemp = Math.max(minTemp, Math.min(maxTemp, temp))

    const normalizedTemp = (clampedTemp - minTemp) / (maxTemp - minTemp)

    const blue = (1 - normalizedTemp) * 255
    const red = normalizedTemp * 255

    return new THREE.Color(`rgb(${~~red}, 0, ${~~blue})`)
}

function normalizeLatLon(lat, lon){
    // Define Colorado's bounds
    const northLat = 41.0;
    const southLat = 37.0;
    const eastLon = -102.0;
    const westLon = -109.0;

    // Normalize the latitude and longitude within Colorado's bounds
    let normalizedLat = (lat - southLat) / (northLat - southLat); // Normalized to [0, 1]
    let normalizedLon = (lon - westLon) / (eastLon - westLon);     // Normalized to [0, 1]

    // Convert to plane coordinates
    let planeWidth = 700;
    let planeHeight = 400;

    let x = normalizedLon * planeWidth - planeWidth / 2;  // Adjust for plane center
    let y = (1 - normalizedLat) * planeHeight - planeHeight / 2; // Adjust for plane center

    return [x, y]

}
  

function createGeometry(data){

    const col = new THREE.Color(getTemperatureColor(~~data.temp))
    let height = data.elev / 300

    console.log(col)

    const geometry = new THREE.BoxGeometry(3, 3, 3)
    const material = new THREE.MeshBasicMaterial({color: col})
    const cube = new THREE.Mesh(geometry, material)

    const latLonPair = normalizeLatLon(data.lat, data.lon)

    //console.log(data.lat, data.lon, data.elev)

    cube.position.set(latLonPair[0], height + 4, latLonPair[1])

    //console.log(cube.position.x + "     " + cube.position.y + "     " + cube.position.z)

    scene.add(cube)
}

async function getLatLong(city, state, country){
    try{
        const response = await axios({
            method: 'get',
            url: `http://api.openweathermap.org/geo/1.0/direct?q=${city},${state},${country}&limit=5&appid=50ff5d3746de608216389ec1912b5f77`
        })

        if(response.data)
            return [response.data[0].lat, response.data[0].lon]
    }
    catch(e){
        console.error(e)
    }
}

async function getTemperature(lat, lon){
    try{
        const response = await axios({
            method: 'get',
            url: `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=50ff5d3746de608216389ec1912b5f77&units=imperial`
        })

        if(response.data){
            return response.data.main.temp;
        }
    }
    catch(e){
        console.error(e)
    }
}

async function getElevation(lat, lon){
    const response = await axios({
        method: 'get',
        url: `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`
    })

    if(response.data){
        return response.data.results[0].elevation * 3.28084
    }
}

async function fetchData(city, state, country){
    let [lat, lon] = await getLatLong(city, state, country)

    if(lat && lon){
        let temp = await getTemperature(lat, lon)
        let elevation = await getElevation(lat, lon)

        //console.log(`Current Temperature at ${lat}, ${lon} is ${temp}F, elevation ${elevation}`)

        return {
            lat: lat,
            lon: lon,
            temp: temp,
            elev: elevation
        }
    
    }
    else{
        console.error('unable to fetch lat/lon')
        return null
    }
}

async function updateScene(city, state, country){
    const data = await fetchData(city, state, country)

    if(data)
    {
        createGeometry(data)
    }
}

async function animate() {
	requestAnimationFrame(animate);

    controls.update();
	renderer.render( scene, camera );
}

const locations = [
    "Fort Collins", "Greeley", "Boulder", "Denver", "Aurora",
    "Colorado Springs", "Pueblo", "Canon City", "Aspen", "Vail",
    "Steamboat Springs", "Grand Junction", "Durango", "Telluride", "Montrose",
    "Crested Butte", "Gunnison", "Leadville", "Fairplay", "Estes Park",
    "Loveland", "Windsor", "Sterling", "Fort Morgan", "Brush",
    "Craig", "Meeker", "Rangely", "Delta", "Paonia",
    "Cedaredge", "Hotchkiss", "Glenwood Springs", "Carbondale", "Basalt",
    "Salida", "Buena Vista", "Alamosa", "Monte Vista", "San Luis",
    "La Junta", "Lamar", "Trinidad", "Walsenburg",
    "Castle Rock", "Parker", "Commerce City", "Thornton", "Westminster", 
    "Dinosaur", "Cortez", "Julesburg", "Springfield"
];

/*
const locations = [
    "Dinosaur", "Cortez", "Julesburg", "Springfield", 'Denver', 'Grand Junction'
]*/
  
for(let city of locations){
    await updateScene(city, 'Colorado', 'USA')
}

animate();