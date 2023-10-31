import * as path from 'path';

const helmDirCarrot = "../../helm"

export function getRelativePathToHelmDir(from: string): string {
    return path.relative(from, __dirname + "/" + helmDirCarrot);
}
