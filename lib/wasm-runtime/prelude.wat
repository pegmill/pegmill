;; Foundation runtime for the wasm parser backend.
;; Provides: 64-byte header, a bump allocator, reset, header accessors,
;; and an echo test. Codegen later adds rule functions to the same module.

(module
  ;; ---- Memory --------------------------------------------------------
  ;; Initial: 1 page (64 KB). Max: 256 pages (16 MB).
  (memory $mem (export "memory") 1 256)

  ;; ---- Header field offsets (constants) -----------------------------
  (global $OFF_ERROR_CODE    i32 (i32.const 0x00))
  (global $OFF_ERROR_POS     i32 (i32.const 0x04))
  (global $OFF_ERROR_MSG_PTR i32 (i32.const 0x08))
  (global $OFF_ERROR_MSG_LEN i32 (i32.const 0x0C))
  (global $OFF_HEAP_TOP      i32 (i32.const 0x10))
  (global $OFF_HEAP_BASE     i32 (i32.const 0x14))
  (global $OFF_INPUT_PTR     i32 (i32.const 0x18))
  (global $OFF_INPUT_LEN     i32 (i32.const 0x1C))
  (global $OFF_RESULT_PTR    i32 (i32.const 0x20))
  (global $OFF_RESULT_LEN    i32 (i32.const 0x24))
  (global $OFF_PAGES_GROWN   i32 (i32.const 0x28))

  (global $HEAP_BASE         i32 (i32.const 0x40))
  (global $PAGE_SIZE         i32 (i32.const 0x10000))
  (global $MAX_PAGES         i32 (i32.const 256))

  ;; ---- Parse state (mutable, reset per parse() call) ----------------
  ;; FAILED is the sentinel value pushed onto the parse stack when a
  ;; rule fails. Real stack entries are pointers >= HEAP_BASE so the
  ;; -1 sentinel is unambiguous.
  (global $FAILED            i32 (i32.const -1))
  (global $curr_pos          (mut i32) (i32.const 0))
  (global $stack_bottom      (mut i32) (i32.const 0))
  (global $stack_top         (mut i32) (i32.const 0))

  ;; ---- init ----------------------------------------------------------
  ;; Called once after instantiation, or to reset to clean state.
  ;; Zeroes the header and sets heap_top = heap_base.
  (func $init (export "init")
    ;; zero header bytes 0..63
    (memory.fill (i32.const 0) (i32.const 0) (i32.const 64))
    ;; heap_top = heap_base = HEAP_BASE
    (i32.store (global.get $OFF_HEAP_BASE) (global.get $HEAP_BASE))
    (i32.store (global.get $OFF_HEAP_TOP)  (global.get $HEAP_BASE))
  )

  ;; ---- reset ---------------------------------------------------------
  ;; Wipe parse state. Result/error pointers become invalid.
  ;; Host must read prior result before calling reset.
  (func $reset (export "reset")
    ;; zero header bytes 0..47 (everything except heap_base/heap_top, pages_grown)
    (memory.fill (i32.const 0) (i32.const 0) (i32.const 0x10))
    (memory.fill (i32.const 0x18) (i32.const 0) (i32.const 0x10))
    ;; rewind heap_top
    (i32.store (global.get $OFF_HEAP_TOP)
               (i32.load (global.get $OFF_HEAP_BASE)))
  )

  ;; ---- alloc ---------------------------------------------------------
  ;; Reserve `size` bytes from the bump allocator. Returns the pointer
  ;; (4-byte aligned). Returns 0 on grow failure.
  (func $alloc (export "alloc") (param $size i32) (result i32)
    (local $size_aligned i32)
    (local $ptr i32)
    (local $new_top i32)
    (local $current_pages i32)
    (local $needed_pages i32)
    (local $grow_by i32)

    ;; size_aligned = (size + 3) & ~3
    (local.set $size_aligned
      (i32.and
        (i32.add (local.get $size) (i32.const 3))
        (i32.const 0xFFFFFFFC)))

    ;; ptr = heap_top
    (local.set $ptr
      (i32.load (global.get $OFF_HEAP_TOP)))

    ;; new_top = ptr + size_aligned
    (local.set $new_top
      (i32.add (local.get $ptr) (local.get $size_aligned)))

    ;; if new_top > current_memory_bytes → grow
    (local.set $current_pages (memory.size))
    (if (i32.gt_u (local.get $new_top)
                  (i32.mul (local.get $current_pages) (global.get $PAGE_SIZE)))
      (then
        ;; needed_pages = ceil(new_top / PAGE_SIZE)
        (local.set $needed_pages
          (i32.div_u
            (i32.add (local.get $new_top) (i32.sub (global.get $PAGE_SIZE) (i32.const 1)))
            (global.get $PAGE_SIZE)))
        ;; bail if needed > max
        (if (i32.gt_u (local.get $needed_pages) (global.get $MAX_PAGES))
          (then (return (i32.const 0))))
        (local.set $grow_by
          (i32.sub (local.get $needed_pages) (local.get $current_pages)))
        ;; if grow fails, memory.grow returns -1
        (if (i32.eq (memory.grow (local.get $grow_by)) (i32.const -1))
          (then (return (i32.const 0))))
        ;; bump telemetry
        (i32.store (global.get $OFF_PAGES_GROWN)
          (i32.add
            (i32.load (global.get $OFF_PAGES_GROWN))
            (local.get $grow_by)))
      )
    )

    ;; commit heap_top
    (i32.store (global.get $OFF_HEAP_TOP) (local.get $new_top))
    (local.get $ptr)
  )

  ;; ---- dealloc ------------------------------------------------------
  ;; No-op in S1. Reserved for future free-list / arena strategies.
  (func $dealloc (export "dealloc") (param $ptr i32) (param $size i32)
    nop
  )

  ;; ---- set_input ----------------------------------------------------
  ;; Host calls after writing UTF-8 bytes into [ptr, ptr+len).
  ;; Just stores the pair into header. WASM-side reads via the same
  ;; offsets when parsing.
  (func $set_input (export "set_input") (param $ptr i32) (param $len i32)
    (i32.store (global.get $OFF_INPUT_PTR) (local.get $ptr))
    (i32.store (global.get $OFF_INPUT_LEN) (local.get $len))
  )

  ;; ---- header accessors ---------------------------------------------
  (func $get_error_code  (export "get_error_code")  (result i32)
    (i32.load (global.get $OFF_ERROR_CODE)))
  (func $get_error_pos   (export "get_error_pos")   (result i32)
    (i32.load (global.get $OFF_ERROR_POS)))
  (func $get_error_msg_ptr (export "get_error_msg_ptr") (result i32)
    (i32.load (global.get $OFF_ERROR_MSG_PTR)))
  (func $get_error_msg_len (export "get_error_msg_len") (result i32)
    (i32.load (global.get $OFF_ERROR_MSG_LEN)))
  (func $get_result_ptr  (export "get_result_ptr")  (result i32)
    (i32.load (global.get $OFF_RESULT_PTR)))
  (func $get_result_len  (export "get_result_len")  (result i32)
    (i32.load (global.get $OFF_RESULT_LEN)))
  (func $get_heap_top    (export "get_heap_top")    (result i32)
    (i32.load (global.get $OFF_HEAP_TOP)))
  (func $get_pages_grown (export "get_pages_grown") (result i32)
    (i32.load (global.get $OFF_PAGES_GROWN)))

  ;; ---- Parse helpers ------------------------------------------------
  ;; The parse stack lives in the heap, allocated lazily by the entry
  ;; point that codegen emits ($parse). These helpers operate on it.

  (func $_stack_push (param $v i32)
    (i32.store (global.get $stack_top) (local.get $v))
    (global.set $stack_top
      (i32.add (global.get $stack_top) (i32.const 4)))
  )

  (func $_stack_pop (result i32)
    (global.set $stack_top
      (i32.sub (global.get $stack_top) (i32.const 4)))
    (i32.load (global.get $stack_top))
  )

  ;; Compare $len bytes at the given pointer against input bytes
  ;; starting at curr_pos. Returns 1 on match, 0 otherwise.
  ;; Out-of-range curr_pos always returns 0.
  (func $_bytes_match (param $expected_ptr i32) (param $expected_len i32) (result i32)
    (local $i i32)
    (local $input_ptr i32)
    (local $input_len i32)
    (local $start i32)

    (local.set $input_ptr (i32.load (global.get $OFF_INPUT_PTR)))
    (local.set $input_len (i32.load (global.get $OFF_INPUT_LEN)))
    (local.set $start (global.get $curr_pos))

    (if (i32.gt_u
          (i32.add (local.get $start) (local.get $expected_len))
          (local.get $input_len))
      (then (return (i32.const 0))))

    (local.set $i (i32.const 0))
    (block $done
      (loop $L
        (br_if $done (i32.ge_u (local.get $i) (local.get $expected_len)))
        (br_if $done
          (i32.ne
            (i32.load8_u
              (i32.add (local.get $input_ptr)
                       (i32.add (local.get $start) (local.get $i))))
            (i32.load8_u
              (i32.add (local.get $expected_ptr) (local.get $i)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $L)))

    (i32.eq (local.get $i) (local.get $expected_len))
  )

  ;; ---- echo (S1 round-trip test) -------------------------------------
  ;; Read input from header, alloc a fresh region, copy bytes there,
  ;; set result_ptr / result_len. Demonstrates: read header, alloc,
  ;; bulk memory copy, write header.
  (func $echo (export "echo")
    (local $in_ptr i32)
    (local $in_len i32)
    (local $out_ptr i32)

    (local.set $in_ptr (i32.load (global.get $OFF_INPUT_PTR)))
    (local.set $in_len (i32.load (global.get $OFF_INPUT_LEN)))

    (local.set $out_ptr (call $alloc (local.get $in_len)))
    (if (i32.eqz (local.get $out_ptr))
      (then
        ;; OOM: error_code = 2
        (i32.store (global.get $OFF_ERROR_CODE) (i32.const 2))
        (return)))

    (memory.copy
      (local.get $out_ptr)
      (local.get $in_ptr)
      (local.get $in_len))

    (i32.store (global.get $OFF_RESULT_PTR) (local.get $out_ptr))
    (i32.store (global.get $OFF_RESULT_LEN) (local.get $in_len))
    (i32.store (global.get $OFF_ERROR_CODE) (i32.const 0))
  )
)
