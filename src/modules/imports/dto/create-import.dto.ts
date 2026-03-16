export class CreateImportDto {
  originalName!: string;
  size!: number;
  temporaryFilePath?: string;
}

export function createImportDtoFromUploadedFile(
  file?: Express.Multer.File,
): CreateImportDto {
  return {
    originalName: file?.originalname ?? '',
    size: file?.size ?? 0,
    temporaryFilePath: file?.path,
  };
}
