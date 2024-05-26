import { Engine, Scene, FreeCamera, HemisphericLight, Vector3, Vector4, Color3, MeshBuilder, StandardMaterial, Mesh, Quaternion, PhysicsImpostor, Texture, Matrix, Axis } from "@babylonjs/core";
import { AmmoJSPlugin } from "@babylonjs/core/Physics/Plugins/ammoJSPlugin";
import * as GUI from "@babylonjs/gui";
import { AssetsManager } from "@babylonjs/core";
import '@babylonjs/loaders';
import { Ray } from "@babylonjs/core/Culling";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import QRCode from 'qrcode';
import io from 'socket.io-client';
import LZUTF8 from 'lzutf8';
import { GridMaterial } from "@babylonjs/materials/grid";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";


// URLのhashパラメータを解析
function getHashParams() {
    const hash = window.location.hash.substring(1);
    const params = {};
    const pairs = hash.split('&');

    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        params[key] = decodeURIComponent(value);
    });

    return params;
}

const params = getHashParams();
const roomName = params.room || btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(5)))).substring(0, 5).replace(/\+/g, '-').replace(/\//g, '_');
let compressedCode = params.code || "";
compressedCode = compressedCode.replace(/\-/g, '+').replace(/\_/g, '/');
let code;

if (compressedCode == "") {
    code = `
        function setup(){
            lineTo(0,0,-500);
            for(let i = 0; i < 10; i++){
                lineTo(0,0, 30+i*60);
                lineTo(-5,0,60+i*60);
            }
        }
    `;
} else {
    code = LZUTF8.decompress(compressedCode, { inputEncoding: 'Base64' });
}


let editor = new EditorView({
    state: EditorState.create({
        doc: code,
        extensions: [javascript()]
    }),
    parent: document.getElementById("editor")
});

let switchCamera;

function updateHash() {
    let code = editor.state.doc.toString();
    let compressed = LZUTF8.compress(code, { outputEncoding: 'Base64' }).replace(/\+/g, '-').replace(/\//g, '_');
    window.location.hash = compressed;
    window.location.reload();
}

Ammo().then((AmmoLib) => {
    const canvas = document.getElementById("renderCanvas"); // Get the canvas element
    const engine = new Engine(canvas, true); // Generate the BABYLON 3D engine
    let scene;
    let chassisMeshTemplate;
    let vehicles = new Set();

    const CHASSIS_WIDTH = 1.8;
    const CHASSIS_HEIGHT = 2;
    const CHASSIS_LENGTH = 3;
    const VEHICLE_MASS = 100;

    const WHEEL_AXIS_HEIGHT_FRONT = 0.5;
    const WHEEL_AXIS_HEIGHT_BACK = 0.5;

    const WHEEL_AXIS_FRONT_POSITION = 1.3;
    const WHEEL_AXIS_BACK_POSITION = -0.8;

    const WHEEL_HALF_TRACK_FRONT = 0.9 - 0.32 / 2;
    const WHEEL_HALF_TRACK_BACK = 0.9 - 0.32 / 2;

    const WHEEL_RADIUS_FRONT = 0.4;
    const WHEEL_WIDTH_FRONT = .32;

    const WHEEL_RADIUS_BACK = 0.4;
    const WHEEL_WIDTH_BACK = .32;

    const FRICTION = 10;
    const SUSPENSION_STIFFNESS = 50;
    const SUSPENSION_DAMPING = 1;
    const SUSPENSION_COMPRESSION = 4.4;
    const SUSPENSION_REST_LENGTH = 0.5;
    const ROLL_INFLUENCE = 0.2;
    const SUSPENSION_MAX_FORCE = 6000000;

    let steeringClamp = 1;
    let maxEngineForce = 500;

    const FRONT_LEFT = 0;
    const FRONT_RIGHT = 1;
    const BACK_LEFT = 2;
    const BACK_RIGHT = 3;

    let clock = 0;
    let course = [];
    let sensorMeshs = [];
    let idxSensor = {};
    let camNumber = 0;
    let camPoss = [new Vector3(-6, 5, 100), new Vector3(20, 35, -250)];
    let camTargets = [new Vector3(-6, -6, 50), new Vector3(6, -20, -50)];

    let advancedTexture;
    let camera;

    var createScene = async function () {
        let scene = new Scene(engine);
        scene.clearColor = new Color3(1, 1, 1);
        scene.ambientColor = new Color3(1, 1, 1);
        camera = new FreeCamera("camera1", camPoss[0], scene);
        camera.setTarget(camTargets[0]);
        camera.attachControl(canvas, true);
        camera.fov = 0.4;
        camera.keysUpward.push(69); //increase elevation
        camera.keysDownward.push(81); //decrease elevation
        camera.keysUp.push(87); //forwards 
        camera.keysDown.push(83); //backwards
        camera.keysLeft.push(65);
        camera.keysRight.push(68);        



        let lineTo = (x, y, z) => {
            course.push(new Vector3(x, y, z));
        };

        let spawn = (name, x, z, dir, speed, Kp, Td) => {
            createVehicle(scene, name, new Vector3(x, 0.5, z), Quaternion.RotationAxis(Vector3.UpReadOnly, dir / 180 * Math.PI), speed, 5, Kp, Td);
        };

        let codeFunc;

        let light = new HemisphericLight("light1", new Vector3(1, 1, 1), scene);
        light.intensity = 1;
        light.diffuse = new Color3(1, 1, 1);

        // GUI
        advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        scene.enablePhysics(new Vector3(0, -9.8, 0), new AmmoJSPlugin(true, AmmoLib));

        var groundMesh = MeshBuilder.CreateGround("groundMesh", { width: 1000, height: 1000, subdivisions: 2 }, scene);
        groundMesh.physicsImpostor = new PhysicsImpostor(groundMesh, PhysicsImpostor.BoxImpostor, { mass: 0, friction: FRICTION, restitution: 0.7 }, scene);

        let groundMaterial = new GridMaterial("groundMaterial", scene);
        groundMesh.material = groundMaterial;
        groundMesh.material.gridRatio = 0.5;
        groundMesh.material.mainColor = new Color3(1, 1, 1);
        groundMesh.material.lineColor = new Color3(0.8, 0.8, 1);
        groundMesh.material.majorUnitFrequency = 10;
        let exMaterial = new GridMaterial("exMaterial", scene);
        exMaterial.gridRatio = 0.1;
        exMaterial.mainColor = new Color3(1, 1, 1);
        exMaterial.lineColor = new Color3(0.5, 0.2, 0);
        exMaterial.majorUnitFrequency = 1;

        let loader = new AssetsManager(scene);
        loader.useDefaultLoadingScreen = false;
        let chassisMeshTask = loader.addMeshTask("body", "", "./model/", "body.gltf");

        chassisMeshTask.onSuccess = function (task) {
            chassisMeshTemplate = task.loadedMeshes[0];
            let children = chassisMeshTemplate.getChildMeshes();
            for (let c of children) {
                c.isVisible = false;
            }
            chassisMeshTemplate.isVisible = false;
        };

        loader.load();

        loader.onFinish = function (task) {
            try {
                let codeFuncGen = new Function('lineTo', 'camera', 'spawn', 'scene', 'groundMaterial', 'exMaterial', code + '\nreturn {setup};');
                codeFunc = codeFuncGen(lineTo, camera, spawn, scene, groundMaterial, exMaterial);
                codeFunc.setup();
            } catch (error) {
                console.error(error);
            }

            let courseMesh = MeshBuilder.CreateLines("course", { points: course }, scene);
            courseMesh.color = new Color3(0, 0, 0);

            scene.registerBeforeRender(function () {
                clock++;
                for (let i = 0; i < course.length - 1; i++) {
                    let ray = Ray.CreateNewFromTo(course[i], course[i + 1]);
                    let hits = ray.intersectsMeshes(sensorMeshs);
                    if (hits.length > 0) {
                        hits.forEach(hit => {
                            let ls = hit.pickedMesh;
                            let v = idxSensor[ls.uniqueId];
                            let m = new Matrix();
                            ls.getWorldMatrix().invertToRef(m);
                            const p = Vector3.TransformCoordinates(hit.pickedPoint, m);
                            if (!v.timeStamp || v.timeStamp < clock || Math.abs(v.e) > Math.abs(p.x)) {
                                v.e = p.x;
                                let vehicle = v.vehicle;
                                let b = v.body;
                                let btvp = vehicle.getChassisWorldTransform().getOrigin();
                                let vp = new Vector3(btvp.x(), btvp.y(), btvp.z());
                                let Lever = hit.pickedPoint.subtract(vp);
                                let btbv = b.getLinearVelocity();
                                let bv = new Vector3(btbv.x(), btbv.y(), btbv.z());
                                let btbav = b.getAngularVelocity();
                                let bav = new Vector3(btbav.x(), btbav.y(), btbav.z());
                                let pv = bv.add(bav.cross(Lever));
                                let p2 = new Vector3();
                                Vector3.TransformNormalFromFloatsToRef(0, 0, 1, ls.getWorldMatrix(), p2);
                                let l = course[i + 1].subtract(course[i]).normalize();
                                let l1 = Vector3.Dot(l, p2);
                                let vs = Vector3.TransformNormal(pv, m);
                                let l2 = l.scale(vs.z / l1);
                                let l3 = Vector3.TransformNormal(l2, m);
                                v.de = l3.x - vs.x;
                                v.timeStamp = clock;
                            }
                        });
                    }
                }

                vehicles.forEach(v => {
                    let vehicle = v.vehicle;
                    let wheelMeshes = v.wheelMeshes;
                    let chassisMesh = v.chassisMesh;
                    let speed = vehicle.getCurrentSpeedKmHour();
                    let engineForce = 0;
                    let breakingForce = 0;
                    let vehicleSteering = 0;

                    engineForce = 0.02 * maxEngineForce * (v.speed - speed);
                    if (v.e) {
                        vehicleSteering = -(v.gain * v.e + v.dgain * v.de);
                    }

                    if (vehicleSteering > steeringClamp) vehicleSteering = steeringClamp;
                    if (vehicleSteering < -steeringClamp) vehicleSteering = -steeringClamp;

                    vehicle.applyEngineForce(engineForce, FRONT_LEFT);
                    vehicle.applyEngineForce(engineForce, FRONT_RIGHT);

                    vehicle.setBrake(breakingForce / 2, FRONT_LEFT);
                    vehicle.setBrake(breakingForce / 2, FRONT_RIGHT);
                    vehicle.setBrake(breakingForce, BACK_LEFT);
                    vehicle.setBrake(breakingForce, BACK_RIGHT);

                    vehicle.setSteeringValue(vehicleSteering, FRONT_LEFT);
                    vehicle.setSteeringValue(vehicleSteering, FRONT_RIGHT);

                    const dist = Vector3.Distance(camera.position, chassisMesh.position);

                    let alpha = 1;
                    if (dist > 50 && 100 > dist) alpha = 1 - (dist - 50) / 50;
                    if (dist > 100) alpha = 0;

                    v.nametag.color = 'rgba(0,128,128,' + alpha + ')';

                    let tm, p, q, i;
                    let n = vehicle.getNumWheels();
                    for (i = 0; i < n; i++) {
                        vehicle.updateWheelTransform(i, true);
                        tm = vehicle.getWheelTransformWS(i);
                        p = tm.getOrigin();
                        q = tm.getRotation();
                        wheelMeshes[i].position.set(p.x(), p.y(), p.z());
                        wheelMeshes[i].rotationQuaternion.set(q.x(), q.y(), q.z(), q.w());
                        wheelMeshes[i].rotate(Axis.Z, Math.PI / 2);
                    }

                    tm = vehicle.getChassisWorldTransform();
                    p = tm.getOrigin();
                    q = tm.getRotation();
                    chassisMesh.position.set(p.x(), p.y(), p.z());
                    chassisMesh.rotationQuaternion.set(q.x(), q.y(), q.z(), q.w());
                    chassisMesh.rotate(Axis.Y, Math.PI);
                    v.duration--;
                    if (p.y() < -1 || v.duration < 0) {
                        for (i = 0; i < n; i++) {
                            wheelMeshes[i].dispose();
                        }
                        v.nametag.dispose();
                        chassisMesh.dispose();
                        vehicles.delete(v);
                    }
                });
            });
        };

        return scene;
    };

    function createVehicle(scene, vname, pos, quat, spd, sz, k, Td) {
        let physicsWorld = scene.getPhysicsEngine().getPhysicsPlugin().world;

        const wheelDirectionCS0 = new AmmoLib.btVector3(0, -1, 0);
        const wheelAxleCS = new AmmoLib.btVector3(-1, 0, 0);
        const wheelMeshes = [];

        let geometry = new AmmoLib.btBoxShape(new AmmoLib.btVector3(CHASSIS_WIDTH * .5, CHASSIS_HEIGHT * .5, CHASSIS_LENGTH * .5));
        let transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(new AmmoLib.btVector3(pos.x, pos.y, pos.z));
        transform.setRotation(new AmmoLib.btQuaternion(quat.x, quat.y, quat.z, quat.w));

        let motionState = new AmmoLib.btDefaultMotionState(transform);
        let localInertia = new AmmoLib.btVector3(0, 0, 0);
        geometry.calculateLocalInertia(VEHICLE_MASS, localInertia);

        let massOffset = new AmmoLib.btVector3(0, 1, 0.25);
        let transform2 = new AmmoLib.btTransform();
        transform2.setIdentity();
        transform2.setOrigin(massOffset);

        let compound = new AmmoLib.btCompoundShape();
        compound.addChildShape(transform2, geometry);

        let body = new AmmoLib.btRigidBody(new AmmoLib.btRigidBodyConstructionInfo(VEHICLE_MASS, motionState, compound, localInertia));
        body.setActivationState(4);

        physicsWorld.addRigidBody(body, 2, ~2);

        let tuning = new AmmoLib.btVehicleTuning();
        let vehicle = new AmmoLib.btRaycastVehicle(tuning, body, new AmmoLib.btDefaultVehicleRaycaster(physicsWorld));
        vehicle.setCoordinateSystem(0, 1, 2);
        physicsWorld.addAction(vehicle);

        let chassisMesh = new Mesh("root", scene);
        chassisMesh.rotationQuaternion = chassisMeshTemplate.rotationQuaternion.clone();
        chassisMesh.scaling = chassisMeshTemplate.scaling;
        let children = chassisMeshTemplate.getChildMeshes();
        for (let c of children) {
            let inst = c.createInstance('');
            inst.parent = chassisMesh;
        }

        let createWheelMesh = (diameter, width) => {
            let wheelMaterial = new StandardMaterial("wheelMaterial", scene);
            let wheelTexture = new Texture("model/wheelTexture.png", scene);
            wheelMaterial.diffuseTexture = wheelTexture;

            let faceColors = [];
            faceColors[1] = new Color3(0, 0, 0);

            let faceUV = [];
            faceUV[0] = new Vector4(0, 0, 1, 1);
            faceUV[2] = new Vector4(0, 0, 1, 1);

            let wheelMesh = MeshBuilder.CreateCylinder("wheelMesh", {
                diameter: diameter,
                height: width,
                tessellation: 24,
                faceColors: faceColors,
                faceUV: faceUV
            }, scene);
            wheelMesh.material = wheelMaterial;
            wheelMesh.rotationQuaternion = new Quaternion();
            return wheelMesh;
        };

        let addWheel = (isFront, positionVector, wheelRadius, wheelThickness, index) => {
            let wheelInfo = vehicle.addWheel(positionVector, wheelDirectionCS0, wheelAxleCS, SUSPENSION_REST_LENGTH, wheelRadius, tuning, isFront);

            wheelInfo.set_m_suspensionStiffness(SUSPENSION_STIFFNESS);
            wheelInfo.set_m_wheelsDampingRelaxation(SUSPENSION_DAMPING);
            wheelInfo.set_m_wheelsDampingCompression(SUSPENSION_COMPRESSION);
            wheelInfo.set_m_maxSuspensionForce(SUSPENSION_MAX_FORCE);
            wheelInfo.set_m_frictionSlip(40);
            wheelInfo.set_m_rollInfluence(ROLL_INFLUENCE);

            return createWheelMesh(wheelRadius * 2, wheelThickness);
        };

        wheelMeshes[FRONT_LEFT] = addWheel(true, new AmmoLib.btVector3(WHEEL_HALF_TRACK_FRONT, WHEEL_AXIS_HEIGHT_FRONT, WHEEL_AXIS_FRONT_POSITION), WHEEL_RADIUS_FRONT, WHEEL_WIDTH_FRONT, FRONT_LEFT);
        wheelMeshes[FRONT_RIGHT] = addWheel(true, new AmmoLib.btVector3(-WHEEL_HALF_TRACK_FRONT, WHEEL_AXIS_HEIGHT_FRONT, WHEEL_AXIS_FRONT_POSITION), WHEEL_RADIUS_FRONT, WHEEL_WIDTH_FRONT, FRONT_RIGHT);
        wheelMeshes[BACK_LEFT] = addWheel(false, new AmmoLib.btVector3(-WHEEL_HALF_TRACK_BACK, WHEEL_AXIS_HEIGHT_BACK, WHEEL_AXIS_BACK_POSITION), WHEEL_RADIUS_BACK, WHEEL_WIDTH_BACK, BACK_LEFT);
        wheelMeshes[BACK_RIGHT] = addWheel(false, new AmmoLib.btVector3(WHEEL_HALF_TRACK_BACK, WHEEL_AXIS_HEIGHT_BACK, WHEEL_AXIS_BACK_POSITION), WHEEL_RADIUS_BACK, WHEEL_WIDTH_BACK, BACK_RIGHT);

        const sensor = MeshBuilder.CreatePlane("sensor", { height: 1, width: 20, sideOrientation: Mesh.DOUBLESIDE }, scene);
        sensor.position.z = sz;
        sensor.parent = chassisMesh;

        let sensorMaterial = new GridMaterial("sensorMaterial", scene);
        sensorMaterial.majorUnitFrequency = 1;
        sensorMaterial.minorUnitVisibility = 0.45;
        sensorMaterial.gridRatio = 10;
        sensorMaterial.backFaceCulling = false;
        sensorMaterial.mainColor = new Color3(0, 0, 0);
        sensorMaterial.lineColor = new Color3(1, 1, 0);
        sensorMaterial.opacity = 0.9 * 0;

        sensor.material = sensorMaterial;
        sensorMeshs.push(sensor);

        let nametag = new Rectangle();
        nametag.width = "1000px";
        nametag.height = "200px";
        nametag.color = "rgba(0, 128, 128, 0.9)";
        nametag.fontFamily = "BIZ UDPゴシック";
        nametag.fontSize = 32;
        nametag.fontWeight = "bold";
        nametag.thickness = 0;
        nametag.background = "transparent";
        nametag.VerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        advancedTexture.addControl(nametag);

        let label = new TextBlock();
        label.text = vname;
        label.lineSpacing = "0px";
        label.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        nametag.addControl(label);

        let tagpos = new Mesh("tagpos", scene);
        tagpos.position.y = 1;
        tagpos.parent = chassisMesh;
        nametag.linkOffsetY = -100;
        nametag.linkWithMesh(tagpos);

        let v = {
            vehicle: vehicle,
            body: body,
            chassisMesh: chassisMesh,
            wheelMeshes: wheelMeshes,
            sensor: sensor,
            speed: spd,
            sensorZ: sz,
            gain: k,
            dgain: k * Td,
            nametag: nametag,
            duration: 60 * 300
        };

        idxSensor[sensor.uniqueId] = v;
        vehicles.add(v);
    }

    scene = createScene();

    switchCamera = () => {
        camNumber = (camNumber + 1) % camPoss.length;
        camera.position = camPoss[camNumber];
        camera.setTarget(camTargets[camNumber]);
    };

    scene.then(function (scene) {
        engine.runRenderLoop(function () {
            scene.render();
            let fpsLabel = document.getElementById("fpsLabel");
            fpsLabel.innerHTML = engine.getFps().toFixed() + " fps";
        });

        window.addEventListener("resize", function () {
            engine.resize();
        });

        console.log(roomName);

        const possibleFormTypes = ["p", "pd"];
        let formType = "p";

        let socket = io({ autoConnect: false });

        socket.on("connect", function () {
            socket.emit('join', roomName);
        });

        socket.connect();

        socket.on('spawn', (design) => {
            createVehicle(scene, design.nickname, new Vector3(0, 0.5, 0), new Quaternion(), parseFloat(design.v), 5, parseFloat(design.Kp), parseFloat(design.Td));
        });
        const emitterURL = new URL(`/${formType}/#` + roomName, document.baseURI);
        const qrcodeElm = document.getElementById("qrcode");
        const qrcodeLinkElm = document.getElementById("qrcodeLink");
        qrcodeLinkElm.href = emitterURL.href;
        QRCode.toCanvas(qrcodeElm, emitterURL.href, { scale: 8, color: { light: "#ffffff00" } });
    });
});

