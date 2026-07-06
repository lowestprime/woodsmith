from __future__ import annotations

import os

from .server import parser, serve


def main() -> None:
    args = parser().parse_args()
    serve(args.host, args.port, args.media_root, args.cache, args.model, args.max_batch, os.getenv("MEDIA_AI_SIDECAR_TOKEN") or None)


if __name__ == "__main__":
    main()
