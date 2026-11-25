extends Node2D

var shot_frame: int = -1
var frame_total: int = 15

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var index := args.find("--animpipe-config")
	if index >= 0:
		var config: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(args[index + 1]))
		frame_total = config["frames"]

func _process(_delta: float) -> void:
	shot_frame += 1
	queue_redraw()

func _draw() -> void:
	var phase := clampf(float(shot_frame) / maxf(1.0, float(frame_total - 1)), 0.0, 1.0)
	draw_circle(Vector2(180, 300), 77, Color("#254451"))
	draw_arc(Vector2(180, 300), 96, 0, TAU, 64, Color("#69837f"), 2.0, true)
	var point := Vector2(180, 300) + Vector2(96 * cos(phase * TAU), 96 * sin(phase * TAU))
	draw_circle(point, 21, Color("#e8ba74"))
	draw_circle(point - Vector2(5, 6), 8, Color("#ffebba"))
	draw_circle(Vector2(180, 300), 22 + 5 * sin(phase * TAU), Color("#79d5b5"))
