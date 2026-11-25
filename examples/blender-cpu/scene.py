"""Offline CPU Cycles shot using Blender 3.4-era APIs."""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

config = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text())
scene = bpy.context.scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = config["profile"]["samples"]
# Debian 12 builds of Blender can lack OpenImageDenoise. Opt in on builds that provide it.
scene.cycles.use_denoising = bool(config["params"].get("denoise", False))
scene.cycles.max_bounces = 4
scene.render.threads_mode = "FIXED"
scene.render.threads = config["threads"]
scene.render.resolution_x = config["width"]
scene.render.resolution_y = config["height"]
scene.render.resolution_percentage = 100
scene.render.fps = config["fps"]
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.world.color = (.25, .27, .35)


def material(name, color, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = .37
    return mat


bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(material("Slate", (.06, .11, .16)))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.62, location=(0, 0, 1.11))
core = bpy.context.object
core.data.materials.append(material("Jade", (.08, .45, .31), .45))
bpy.ops.mesh.primitive_torus_add(major_radius=1.02, minor_radius=.055, location=(0, 0, 1.12))
ring = bpy.context.object
ring.data.materials.append(material("Amber", (.64, .30, .06), .6))

bpy.ops.object.light_add(type="AREA", location=(2.6, -1, 5))
key = bpy.context.object
key.data.energy = 500
key.data.shape = "DISK"
key.data.size = 3
key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(2.5, -5, 2.3))
camera = bpy.context.object
camera.data.lens = 47
scene.camera = camera

for i in range(1, config["frames"] + 1):
    phase = (i - 1) / max(1, config["frames"] - 1)
    scene.frame_set(i)
    core.rotation_euler = (.4 + phase, phase * 2.5, -.25)
    core.location.z = 1.08 + .20 * math.sin(phase * math.pi)
    ring.rotation_euler = (.4 + phase * .90, -.38, phase * 1.4)
    camera.location.x = 2.5 - phase * 1.2
    camera.rotation_euler = (Vector((0, 0, .99)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(Path(config["frames_dir"]) / f"f_{i:04}.png")
    bpy.ops.render.render(write_still=True)
