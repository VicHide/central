import sys

from rembg import new_session, remove


def main() -> int:
    imagem = sys.stdin.buffer.read()
    if not imagem:
        print("Nenhuma imagem foi recebida.", file=sys.stderr)
        return 2

    sessao = new_session("isnet-anime")
    resultado = remove(imagem, session=sessao, force_return_bytes=True)
    sys.stdout.buffer.write(resultado)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
